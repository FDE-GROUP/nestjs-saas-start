import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';
import { createRpcClient } from './rpc-client';

/** 记录最近一次出网请求，便于断言 URL/method/body。 */
interface Captured {
  url: string;
  init: RequestInit;
}

const ORIGIN = 'http://test.local';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** 用 mock globalThis.fetch 驱动 createRpcClient（OpenAPILink 缺省走 globalThis.fetch）。 */
function withFetch(handler: (captured: Captured) => Response) {
  const captured: Captured = { url: '', init: {} };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init: RequestInit = {}) => {
    captured.url = typeof input === 'string' ? input : String(input);
    captured.init = init;
    return Promise.resolve(handler(captured));
  }) as unknown as typeof fetch;
  return { captured, restore: () => (globalThis.fetch = original) };
}

describe('@saas/api-client · typed oRPC 客户端（mock fetch）', () => {
  it('GET 无入参：URL=origin+/api/v1/health·成功信封 {data,…} 拆回 payload', async () => {
    const hook = withFetch(() =>
      jsonResponse({
        data: { status: 'ok', info: {}, error: {}, details: {} },
        statusCode: 200,
        message: 'Success',
      }),
    );
    try {
      const client = createRpcClient({ origin: ORIGIN });
      const result = await client.health.check();
      expect(hook.captured.url).toBe(`${ORIGIN}/api/v1/health`);
      expect(hook.captured.init.method).toBe('GET');
      // 信封已拆：直接拿到内层 payload（非 {data,statusCode,message}）。
      expect(result).toEqual({ status: 'ok', info: {}, error: {}, details: {} });
    } finally {
      hook.restore();
    }
  });

  it('GET query 拆分：limit/offset 进查询串（与后端 compact 输入对称）', async () => {
    const hook = withFetch(() =>
      jsonResponse({
        data: { items: [], total: 0, limit: 10, offset: 0 },
        statusCode: 200,
        message: 'Success',
      }),
    );
    try {
      const client = createRpcClient({ origin: ORIGIN });
      const page = await client.workspaces.list({ limit: 10, offset: 0 });
      const url = new URL(hook.captured.url);
      expect(url.pathname).toBe('/api/v1/workspaces');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('offset')).toBe('0');
      expect(page.total).toBe(0);
    } finally {
      hook.restore();
    }
  });

  it('PATCH 路径参 + body：id 进 URL、其余进 JSON body（id 不入 body）', async () => {
    const hook = withFetch(() =>
      jsonResponse({ data: { ok: true }, statusCode: 200, message: 'Success' }),
    );
    try {
      const client = createRpcClient({ origin: ORIGIN });
      await client.workspaces.update({ id: 'w1', name: 'Renamed' });
      expect(hook.captured.url).toBe(`${ORIGIN}/api/v1/workspaces/w1`);
      expect(hook.captured.init.method).toBe('PATCH');
      const body = JSON.parse(String(hook.captured.init.body));
      expect(body).toEqual({ name: 'Renamed' });
      expect(body.id).toBeUndefined();
    } finally {
      hook.restore();
    }
  });

  it('【换轨 B-6c】Date-on-wire：规范 ISO 串回环还原为 Date（非规范串不误伤）', async () => {
    const hook = withFetch(() =>
      jsonResponse({
        data: {
          items: [
            {
              id: 'p1',
              title: 't',
              content: null,
              published: false,
              organizationId: 'o1',
              workspaceId: null,
              createdAt: '2026-01-02T03:04:05.000Z',
              updatedAt: '2026-01-02T03:04:05.000Z',
            },
          ],
          hasMore: false,
          nextCursor: 'cur_2026',
        },
        statusCode: 200,
        message: 'Success',
      }),
    );
    try {
      const client = createRpcClient({ origin: ORIGIN });
      const page = await client.posts.list({ limit: 10 });
      const post = page.items[0] as unknown as Record<string, unknown>;
      expect(post.createdAt).toBeInstanceOf(Date);
      expect((post.createdAt as Date).toISOString()).toBe('2026-01-02T03:04:05.000Z');
      // 非规范 ISO 形（游标/普通串）保留为 string·不误伤。
      expect(typeof page.nextCursor).toBe('string');
    } finally {
      hook.restore();
    }
  });

  it('错误线：REST 错误体 → ORPCError（status 映射 code·原始 body 挂 .data 供 errorCode 分支）', async () => {
    const hook = withFetch(() =>
      jsonResponse(
        {
          statusCode: 404,
          message: 'nope',
          error: 'Not Found',
          timestamp: 't',
          path: '/api/v1/workspaces/w1',
          requestId: 'r',
          errorCode: 'WORKSPACE:NOT_FOUND',
        },
        404,
      ),
    );
    try {
      const client = createRpcClient({ origin: ORIGIN });
      const err = await client.workspaces.remove({ id: 'w1' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ORPCError);
      const orpc = err as ORPCError<string, { statusCode: number; errorCode?: string }>;
      expect(orpc.code).toBe('NOT_FOUND');
      expect(orpc.message).toBe('nope');
      expect(orpc.data.statusCode).toBe(404);
      expect(orpc.data.errorCode).toBe('WORKSPACE:NOT_FOUND');
    } finally {
      hook.restore();
    }
  });
});

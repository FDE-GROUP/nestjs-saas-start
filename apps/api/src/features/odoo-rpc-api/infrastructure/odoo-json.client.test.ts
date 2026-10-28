import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../../../config/config.service';
import { OdooJsonClient } from './odoo-json.client';

/**
 * OdooJsonClient 单测（fake `globalThis.fetch`·不发真实网络——活体链路归
 * `api/odoo-rpc-live.e2e.test.ts` env-gated 真 Odoo 段）。
 * 锁四件行为：JSON-RPC body 形、uid 懒解析复用、error 信封抛错、配置缺席 fail-closed。
 */

const ENV: Record<string, string> = {
  ODOO_BASE_URL: 'http://odoo.test:8069',
  ODOO_DB: 'odoo-demo',
  ODOO_LOGIN: 'saas_rpc_ro',
  ODOO_API_KEY: 'test-key-not-a-credential',
};

function makeClient(env: Record<string, string> = ENV): OdooJsonClient {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new OdooJsonClient(config);
}

function jsonRpcResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OdooJsonClient（/jsonrpc 只读面）', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('首次调用先 authenticate 拿 uid，后续复用（不再重复鉴权）', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRpcResponse({ jsonrpc: '2.0', id: 1, result: 10 }))
      .mockResolvedValueOnce(jsonRpcResponse({ jsonrpc: '2.0', id: 2, result: 4 }))
      .mockResolvedValueOnce(jsonRpcResponse({ jsonrpc: '2.0', id: 3, result: 37 }));
    const client = makeClient();

    await expect(client.searchCount('res.partner', [])).resolves.toBe(4);
    await expect(client.searchCount('product.template', [])).resolves.toBe(37);

    expect(fetchSpy).toHaveBeenCalledTimes(3); // auth + 2×execute_kw
    const authBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(authBody.params).toMatchObject({ service: 'common', method: 'authenticate' });
    expect(authBody.params.args).toEqual([
      'odoo-demo',
      'saas_rpc_ro',
      'test-key-not-a-credential',
      {},
    ]);
    const kwBody = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body));
    expect(kwBody.params).toMatchObject({ service: 'object', method: 'execute_kw' });
    expect(kwBody.params.args.slice(0, 4)).toEqual([
      'odoo-demo',
      10,
      'test-key-not-a-credential',
      'res.partner',
    ]);
  });

  it('authenticate 返回 false（key 无效）→ 503 而非把布尔当 uid', async () => {
    fetchSpy.mockResolvedValueOnce(jsonRpcResponse({ jsonrpc: '2.0', id: 1, result: false }));
    const client = makeClient();
    await expect(client.searchCount('res.partner', [])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('上游 error 信封 → BadRequestException（不吞错）', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRpcResponse({ jsonrpc: '2.0', id: 1, result: 10 }))
      .mockResolvedValueOnce(
        jsonRpcResponse({
          jsonrpc: '2.0',
          id: 2,
          error: { code: 0, message: 'Odoo Server Error', data: { message: 'Access Denied' } },
        }),
      );
    const client = makeClient();
    await expect(client.searchCount('res.partner', [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ODOO_* 配置缺席 → 503（fail-closed·不发网络请求）', async () => {
    const client = makeClient({});
    await expect(client.searchCount('res.partner', [])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('上游 HTTP 非 2xx → 503', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const client = makeClient();
    await expect(client.searchCount('res.partner', [])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

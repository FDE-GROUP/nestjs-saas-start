import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import type { TenantScopeResolver } from '@core/saas-kit/tenant-isolation/tenant-scope-resolver.port';
import { HttpException } from '@nestjs/common';
import { errorResponseSchema } from '@saas/contracts/index';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpTokenVerifier } from '../../../modules/auth/application/ports/mcp-token-verifier.port';
import { McpAgentSurfaceService } from './mcp-agent-surface.service';
import type { McpToolExecutorService } from './mcp-tool-executor.service';

/**
 * MCP 会话网关鉴权链单测（切片 2·mock 端口零 SDK 网络·deny-by-default 负例卡尺）。
 *
 * 卡尺：①凭证校验失败原样落 401（防探测文案单源在 verifier，网关不改写）；
 * ②租内无角色分配 → 403 fail-closed，ALS 绑定不发生；③绑定形 = D7 显式租激活
 * （tenantId/userId/role/orgVisibility·无活动组织轴）且会话处理在其内进行；
 * ④他租 sessionId 冒用视作无会话（400·不透露存在性）；⑤scope→可见工具映射；
 * ⑥本面全部 JSON 错误体过 `@saas/contracts` `errorResponseSchema` 强锁（承换轨评审 M3）。
 * 真协议往返（initialize/tools/list/tools/call）由 gated e2e 承担。
 */
describe('McpAgentSurfaceService（鉴权链）', () => {
  let verifier: { verify: ReturnType<typeof vi.fn> };
  let resolver: {
    resolveTenantRole: ReturnType<typeof vi.fn>;
    readOrgVisibility: ReturnType<typeof vi.fn>;
  };
  let tenant: { run: ReturnType<typeof vi.fn> };
  let executor: { execute: ReturnType<typeof vi.fn> };
  let surface: McpAgentSurfaceService;

  const cred = { credentialId: 'c1', tenantId: 'T1', userId: 'U1', name: 'cli', scopes: ['read'] };

  /** 假 Fastify 对偶：reply.hijack + raw.writeHead().end() 链·写出捕获。 */
  function fakePair(options: { authorization?: string; sessionId?: string; body?: unknown }): {
    req: FastifyRequest;
    reply: FastifyReply;
    written: { status?: number; body?: string };
  } {
    const written: { status?: number; body?: string } = {};
    const raw = {
      headersSent: false,
      writeHead: vi.fn((status: number) => ({
        end: (body?: string) => {
          written.status = status;
          written.body = body;
        },
      })),
    };
    const headers: Record<string, string> = {};
    if (options.authorization) headers.authorization = options.authorization;
    if (options.sessionId) headers['mcp-session-id'] = options.sessionId;
    const req = {
      headers,
      body: options.body,
      raw: {},
      url: '/mcp',
      id: 'req-test',
    } as unknown as FastifyRequest;
    const reply = { hijack: vi.fn(), raw } as unknown as FastifyReply;
    return { req, reply, written };
  }

  /**
   * 错误体契约强锁（承评审 M3）：写出体必须满足 `@saas/contracts` `errorResponseSchema`
   * 必填字段（statusCode/message/error/timestamp/path/requestId），与 REST 面同一口径。
   */
  function expectEnvelope(body?: string): Record<string, unknown> {
    const parsed = JSON.parse(body ?? '{}') as Record<string, unknown>;
    const result = errorResponseSchema.safeParse(parsed);
    expect(result.success, `错误体不合契约: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    return parsed;
  }

  /** 塞入既有会话（绕过真实 initialize 网络链的测试后门·只动私有表）。 */
  function seedSession(sessionId: string, tenantId: string) {
    const transport = { handleRequest: vi.fn().mockResolvedValue(undefined), sessionId };
    (surface as unknown as { sessions: Map<string, unknown> }).sessions.set(sessionId, {
      transport,
      tenantId,
    });
    return transport;
  }

  beforeEach(() => {
    verifier = { verify: vi.fn().mockResolvedValue(cred) };
    resolver = {
      resolveTenantRole: vi.fn().mockResolvedValue('member'),
      readOrgVisibility: vi.fn().mockResolvedValue('shared'),
    };
    tenant = { run: vi.fn((_ctx: unknown, fn: () => unknown) => fn()) };
    executor = { execute: vi.fn() };
    surface = new McpAgentSurfaceService(
      verifier as unknown as McpTokenVerifier,
      resolver as unknown as TenantScopeResolver,
      tenant as unknown as TenantIsolationService,
      executor as unknown as McpToolExecutorService,
    );
  });

  it('凭证无效 → 401 原样透传 verifier 防探测体，ALS 绑定不发生', async () => {
    verifier.verify.mockRejectedValue(
      new HttpException(
        {
          statusCode: 401,
          errorCode: ERROR_CODES.MCP_CREDENTIAL_INVALID,
          message: 'Invalid MCP credential',
        },
        401,
      ),
    );
    const { req, reply, written } = fakePair({ authorization: 'Bearer mcp_deadbeef', body: {} });
    await surface.handlePost(req, reply);
    expect(written.status).toBe(401);
    expect(written.body).toContain(ERROR_CODES.MCP_CREDENTIAL_INVALID);
    const envelope = expectEnvelope(written.body);
    expect(envelope.requestId).toBe('req-test');
    expect(envelope.path).toBe('/mcp');
    expect(tenant.run).not.toHaveBeenCalled();
  });

  it('bearer 缺失 → 空串直交 verifier（本面不复制判据），401 落原样体', async () => {
    verifier.verify.mockRejectedValue(
      new HttpException({ statusCode: 401, errorCode: ERROR_CODES.MCP_CREDENTIAL_INVALID }, 401),
    );
    const { req, reply, written } = fakePair({ body: {} });
    await surface.handlePost(req, reply);
    expect(verifier.verify).toHaveBeenCalledWith('');
    expect(written.status).toBe(401);
    // 防探测体缺 message → 本面补齐 reason phrase，仍合契约。
    expectEnvelope(written.body);
  });

  it('租内解析不出角色（成员资格已撤）→ 403 fail-closed，不绑 ALS 不触会话', async () => {
    resolver.resolveTenantRole.mockResolvedValue(undefined);
    const { req, reply, written } = fakePair({
      authorization: 'Bearer mcp_ok',
      body: { method: 'tools/call' },
    });
    await surface.handlePost(req, reply);
    expect(written.status).toBe(403);
    expect(written.body).toContain(ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT);
    expectEnvelope(written.body);
    expect(tenant.run).not.toHaveBeenCalled();
  });

  it('有效凭证 → 按 D7 显式租激活形绑 ALS，会话处理在窗内执行', async () => {
    const transport = seedSession('s1', 'T1');
    const body = { method: 'tools/call' };
    const { req, reply, written } = fakePair({
      authorization: 'Bearer mcp_ok',
      sessionId: 's1',
      body,
    });
    await surface.handlePost(req, reply);
    expect(tenant.run).toHaveBeenCalledTimes(1);
    expect(tenant.run.mock.calls[0]?.[0]).toEqual({
      tenantId: 'T1',
      userId: 'U1',
      role: 'member',
      orgVisibility: 'shared',
    });
    expect(transport.handleRequest).toHaveBeenCalledOnce();
    expect(written.status).toBeUndefined();
  });

  it('他租 sessionId 冒用 → 视作无会话 400（存在性零透露），transport 不触', async () => {
    const transport = seedSession('s2', 'T2');
    const { req, reply, written } = fakePair({
      authorization: 'Bearer mcp_ok',
      sessionId: 's2',
      body: { method: 'tools/call' },
    });
    await surface.handlePost(req, reply);
    expect(written.status).toBe(400);
    expectEnvelope(written.body);
    expect(transport.handleRequest).not.toHaveBeenCalled();
  });

  it('DELETE：未知/他租会话 → 404；同租会话 → 交 transport 终止', async () => {
    const missing = fakePair({ authorization: 'Bearer mcp_ok', sessionId: 'nope' });
    await surface.handleDelete(missing.req, missing.reply);
    expect(missing.written.status).toBe(404);
    expectEnvelope(missing.written.body);

    const transport = seedSession('s3', 'T1');
    const owned = fakePair({ authorization: 'Bearer mcp_ok', sessionId: 's3' });
    await surface.handleDelete(owned.req, owned.reply);
    expect(transport.handleRequest).toHaveBeenCalledOnce();
  });

  it('scope→可见工具映射：空集零工具（deny-by-default），read 落两读·write 落写工具', () => {
    expect(surface.visibleTools([])).toEqual([]);
    expect(surface.visibleTools(['read'])).toEqual(['tenant.directory', 'posts.list']);
    expect(surface.visibleTools(['write'])).toEqual(['workspace.create']);
  });
});

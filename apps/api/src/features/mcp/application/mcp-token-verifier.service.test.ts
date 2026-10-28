import type { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  McpAccessTokenRecord,
  McpAccessTokenStore,
} from '../../../modules/auth/application/ports/mcp-access-token-store.port';
import { McpTokenVerifierService } from './mcp-token-verifier.service';
import { selectToolNames } from './mcp-tool-registry';

/**
 * MCP 凭证校验中间件单测（切片 1 四负例之消费面判据·纯 mock 端口零 DB）。
 *
 * 卡尺：①三态（未命中/已撤/已过期）统一 401 同码防探测；②租户封禁 403 走
 * TenantStatusService 单源；③空 scope 集零可用工具（deny-by-default）；
 * ④窄写失败不阻断校验主路。真库链路语义由 auth 属主区 gated e2e 承担。
 */
describe('McpTokenVerifierService', () => {
  let store: { findByHash: ReturnType<typeof vi.fn>; touchLastUsed: ReturnType<typeof vi.fn> };
  let tenantStatus: { isBlocked: ReturnType<typeof vi.fn> };
  let verifier: McpTokenVerifierService;

  const future = new Date(Date.now() + 86400000);
  const record = (over: Partial<McpAccessTokenRecord> = {}): McpAccessTokenRecord => ({
    id: 'c1',
    tenantId: 'T1',
    userId: 'U1',
    name: 'cli',
    scopes: ['read'],
    expiresAt: future,
    lastUsedAt: null,
    revokedAt: null,
    ...over,
  });

  beforeEach(() => {
    store = { findByHash: vi.fn(), touchLastUsed: vi.fn().mockResolvedValue(undefined) };
    tenantStatus = { isBlocked: vi.fn().mockResolvedValue(false) };
    verifier = new McpTokenVerifierService(
      store as unknown as McpAccessTokenStore,
      tenantStatus as unknown as TenantStatusService,
    );
  });

  const expectHttp = (err: unknown, status: number, code: string) => {
    expect(err).toBeInstanceOf(HttpException);
    const body = (err as HttpException).getResponse() as { statusCode: number; errorCode: string };
    expect(body.statusCode).toBe(status);
    expect(body.errorCode).toBe(code);
  };

  it('有效凭证：返回签发盖章租户单源视图并刷 lastUsedAt', async () => {
    store.findByHash.mockResolvedValue(record());
    const v = await verifier.verify('mcp_deadbeef');
    expect(v).toEqual({
      credentialId: 'c1',
      tenantId: 'T1',
      userId: 'U1',
      name: 'cli',
      scopes: ['read'],
    });
    expect(store.findByHash).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(store.touchLastUsed).toHaveBeenCalledWith('c1', expect.any(Date));
  });

  it('三态合一 401：未命中/已撤销/已过期同码同案（防探测·凭证存在性零泄露）', async () => {
    for (const row of [
      null,
      record({ revokedAt: new Date() }),
      record({ expiresAt: new Date(0) }),
    ]) {
      store.findByHash.mockResolvedValue(row);
      await expect(verifier.verify('mcp_x')).rejects.toBeInstanceOf(HttpException);
      const err = await verifier.verify('mcp_x').catch((e: unknown) => e);
      expectHttp(err, 401, ERROR_CODES.MCP_CREDENTIAL_INVALID);
    }
  });

  it('失能联动：凭证有效但属租被封禁 → 403（TenantStatusService 单源·不落第二判据）', async () => {
    store.findByHash.mockResolvedValue(record());
    tenantStatus.isBlocked.mockResolvedValue(true);
    const err = await verifier.verify('mcp_x').catch((e: unknown) => e);
    expectHttp(err, 403, ERROR_CODES.MCP_TENANT_SUSPENDED);
    expect(tenantStatus.isBlocked).toHaveBeenCalledWith('T1');
    expect(store.touchLastUsed).not.toHaveBeenCalled(); // 封禁路径不记账
  });

  it('空 bearer：fail-closed 直接 401，绝不触库', async () => {
    for (const bad of ['', '   ']) {
      await expect(verifier.verify(bad)).rejects.toBeInstanceOf(HttpException);
    }
    expect(store.findByHash).not.toHaveBeenCalled();
  });

  it('窄写失败不阻断：touchLastUsed 抛错仍校验成功（审计面非安全闸）', async () => {
    store.findByHash.mockResolvedValue(record());
    store.touchLastUsed.mockRejectedValue(new Error('db hiccup'));
    await expect(verifier.verify('mcp_x')).resolves.toMatchObject({ tenantId: 'T1' });
  });

  it('scope 零可落 = 零可用工具；read 只落读面工具（deny-by-default）', () => {
    expect(selectToolNames([])).toEqual([]);
    expect(selectToolNames(['read'])).toEqual(['tenant.directory', 'posts.list']);
    expect(selectToolNames(['read', 'write'])).toEqual(['tenant.directory', 'posts.list']);
  });
});

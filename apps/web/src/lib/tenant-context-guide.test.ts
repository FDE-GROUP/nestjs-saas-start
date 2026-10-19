import { ERROR_CODES } from '@saas/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// probeTenantContext 判别分态锁形（module-frontend-tenant-admin-guide）：
// 非目标码不动作；命中码补查 /tenants 分两态；探测自身失败保守归零组织态。
const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock('./api', () => ({ api: { GET: mocks.GET } }));

const { probeTenantContext } = await import('./tenant-context-guide');

const noCtx = {
  statusCode: 403,
  message: 'No active tenant context',
  errorCode: ERROR_CODES.TENANCY_NO_ACTIVE_CONTEXT,
};

beforeEach(() => {
  mocks.GET.mockReset();
});

describe('probeTenantContext', () => {
  it('非 TENANCY:NO_ACTIVE_CONTEXT 错误 → null（调用方维持 ErrorPanel），不发探测请求', async () => {
    await expect(probeTenantContext({ statusCode: 500, message: 'boom' })).resolves.toBeNull();
    expect(mocks.GET).not.toHaveBeenCalled();
  });

  it('命中码 + /tenants 空 → 零组织态（hasMemberships:false）', async () => {
    mocks.GET.mockResolvedValue({ data: { data: [] }, error: null });
    await expect(probeTenantContext(noCtx)).resolves.toEqual({ hasMemberships: false });
    expect(mocks.GET).toHaveBeenCalledWith('/api/v1/tenants');
  });

  it('命中码 + /tenants 有行 → 未激活态（hasMemberships:true）', async () => {
    mocks.GET.mockResolvedValue({ data: { data: [{ id: 'o1' }] }, error: null });
    await expect(probeTenantContext(noCtx)).resolves.toEqual({ hasMemberships: true });
  });

  it('命中码 + 探测请求自身失败 → 保守归零组织态（不抛不阻塞渲染）', async () => {
    mocks.GET.mockRejectedValue(new Error('network'));
    await expect(probeTenantContext(noCtx)).resolves.toEqual({ hasMemberships: false });
  });
});

import { ERROR_CODES } from '@saas/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// probeOrganizationContext 判别分态锁形（module-frontend-organization-admin-guide）：
// 非目标码不动作；命中码补查 /organizations 分两态；探测自身失败保守归零组织态。
const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock('./api', () => ({ api: { GET: mocks.GET } }));

const { probeOrganizationContext } = await import('./organization-context-guide');

const noCtx = {
  statusCode: 403,
  message: 'No active organization context',
  errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
};

beforeEach(() => {
  mocks.GET.mockReset();
});

describe('probeOrganizationContext', () => {
  it('非 ISOLATION:NO_ACTIVE_CONTEXT 错误 → null（调用方维持 ErrorPanel），不发探测请求', async () => {
    await expect(
      probeOrganizationContext({ statusCode: 500, message: 'boom' }),
    ).resolves.toBeNull();
    expect(mocks.GET).not.toHaveBeenCalled();
  });

  it('命中码 + /organizations 空 → 零组织态（hasMemberships:false）', async () => {
    mocks.GET.mockResolvedValue({ data: { data: [] }, error: null });
    await expect(probeOrganizationContext(noCtx)).resolves.toEqual({ hasMemberships: false });
    expect(mocks.GET).toHaveBeenCalledWith('/api/v1/organizations');
  });

  it('命中码 + /organizations 有行 → 未激活态（hasMemberships:true）', async () => {
    mocks.GET.mockResolvedValue({ data: { data: [{ id: 'o1' }] }, error: null });
    await expect(probeOrganizationContext(noCtx)).resolves.toEqual({ hasMemberships: true });
  });

  it('命中码 + 探测请求自身失败 → 保守归零组织态（不抛不阻塞渲染）', async () => {
    mocks.GET.mockRejectedValue(new Error('network'));
    await expect(probeOrganizationContext(noCtx)).resolves.toEqual({ hasMemberships: false });
  });
});

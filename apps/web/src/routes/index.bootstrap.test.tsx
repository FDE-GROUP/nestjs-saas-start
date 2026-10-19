// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../routeTree.gen';

/**
 * dashboard loader「引导落租」路由级集成（module-frontend-tenant-bootstrap-activation A）。
 * 承 `invitations.test.tsx` 手法：`vi.mock(lib/session·lib/api)` 注入拟真 envelope·经真实 routeTree
 * 的 memory router 打穿 loader·全 mock 不触网。钉四条落租分支：
 * - 无 active + 恰一个成员组织 → 自动 `POST /tenants/active`（body=该 org）+ 订阅取数 → SubscriptionView；
 * - 已有 active → 不自动激活、直接订阅取数；
 * - 无 active + 多组织 → 不自动择（交手动切换器）·订阅面不打·呈现切换引导；
 * - 无 active + 零组织 → 不激活·订阅面不打·呈现「联系管理员」引导。
 */
const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock('../lib/session', () => ({ requireSession: mocks.requireSession }));
vi.mock('../lib/api', () => ({
  api: { GET: mocks.GET, POST: mocks.POST, PATCH: vi.fn(), DELETE: vi.fn() },
}));

const activeSub = {
  hasSubscription: true,
  plan: 'pro',
  seatsLimit: 5,
  used: 2,
  remaining: 3,
  providerCustomerId: 'cus_123',
};

function session(activeOrganizationId?: string) {
  return {
    user: { id: 'u1', email: 'a@b.c' },
    session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z', activeOrganizationId },
  };
}

/** GET 按 path 分派：/tenants 返回成员组织列表·/subscriptions/current 返回订阅快照。 */
function stubGet(tenants: { id: string; name: string }[]) {
  mocks.GET.mockImplementation((path: string) => {
    if (path === '/api/v1/tenants')
      return Promise.resolve({ data: { data: tenants }, error: null });
    if (path === '/api/v1/subscriptions/current')
      return Promise.resolve({ data: { data: activeSub }, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  mocks.GET.mockReset();
  mocks.POST.mockReset();
  mocks.requireSession.mockReset();
  mocks.POST.mockResolvedValue({ data: {}, error: null });
});

afterEach(cleanup);

describe('dashboard loader 引导落租', () => {
  it('无 active + 恰一个成员组织 → 自动激活该组织并取订阅 → 渲订阅快照', async () => {
    mocks.requireSession.mockResolvedValue(session(undefined));
    stubGet([{ id: 'org-a', name: 'Acme' }]);
    renderAt('/');
    await vi.waitFor(() => expect(screen.getByTestId('sub-plan').textContent).toBe('pro'));
    expect(mocks.POST).toHaveBeenCalledWith('/api/v1/tenants/active', {
      body: { organizationId: 'org-a' },
    });
    expect(mocks.GET).toHaveBeenCalledWith('/api/v1/subscriptions/current');
  });

  it('已有 activeOrganizationId → 不自动激活·直接取订阅', async () => {
    mocks.requireSession.mockResolvedValue(session('org-existing'));
    stubGet([{ id: 'org-a', name: 'Acme' }]);
    renderAt('/');
    await vi.waitFor(() => expect(screen.getByTestId('sub-plan').textContent).toBe('pro'));
    expect(mocks.POST).not.toHaveBeenCalled();
    expect(mocks.GET).toHaveBeenCalledWith('/api/v1/subscriptions/current');
  });

  it('无 active + 多组织 → 不自动择（交手动切换器）·订阅面不打·呈现切换引导', async () => {
    mocks.requireSession.mockResolvedValue(session(undefined));
    stubGet([
      { id: 'org-a', name: 'Acme' },
      { id: 'org-b', name: 'Globex' },
    ]);
    renderAt('/');
    await vi.waitFor(() =>
      expect(screen.getByText('尚无活跃租户，请在「我的租户」切换到一个组织。')).toBeTruthy(),
    );
    expect(mocks.POST).not.toHaveBeenCalled();
    expect(mocks.GET).not.toHaveBeenCalledWith('/api/v1/subscriptions/current');
  });

  it('无 active + 零组织 → 不激活·订阅面不打·呈现「联系管理员」引导', async () => {
    mocks.requireSession.mockResolvedValue(session(undefined));
    stubGet([]);
    renderAt('/');
    await vi.waitFor(() =>
      expect(screen.getByText('你尚未加入任何组织，请联系管理员为你分配一个租户。')).toBeTruthy(),
    );
    expect(mocks.POST).not.toHaveBeenCalled();
    expect(mocks.GET).not.toHaveBeenCalledWith('/api/v1/subscriptions/current');
  });
});

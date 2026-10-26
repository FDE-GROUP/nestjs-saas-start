// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * dashboard loader「引导落租」路由级集成（module-frontend-organization-bootstrap-activation A）。
 * 承 `invitations.test.tsx` 手法：`vi.mock(lib/session·lib/api)` 注入拟真 envelope·经真实 routeTree
 * 的 memory router 打穿 loader·全 mock 不触网。钉四条落租分支：
 * - 无 active + 恰一个成员组织 → 自动 `POST /organizations/active`（body=该 org）+ 订阅取数 → SubscriptionView；
 * - 已有 active → 不自动激活、直接订阅取数；
 * - 无 active + 多组织 → 不自动择（交手动切换器）·订阅面不打·呈现切换引导；
 * - 无 active + 零组织 → 不激活·订阅面不打·呈现 onboarding 引导（申请入口 + 邀请链接）。
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

/** GET 按 path 分派：/organizations 返回成员组织列表·/subscriptions/current 返回订阅快照。 */
function stubGet(organizations: { id: string; name: string }[]) {
  mocks.GET.mockImplementation((path: string) => {
    if (path === '/api/v1/organizations')
      return Promise.resolve({ data: { data: organizations }, error: null });
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
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
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
    expect(mocks.POST).toHaveBeenCalledWith('/api/v1/organizations/active', {
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
      expect(screen.getByText('尚无活跃租户，请在「租户与组织」中选择。')).toBeTruthy(),
    );
    expect(mocks.POST).not.toHaveBeenCalled();
    expect(mocks.GET).not.toHaveBeenCalledWith('/api/v1/subscriptions/current');
  });

  it('无 active + 零组织 → 不激活·订阅面不打·呈现 onboarding 引导（申请入口 + 邀请链接）', async () => {
    mocks.requireSession.mockResolvedValue(session(undefined));
    stubGet([]);
    renderAt('/');
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: '申请创建组织' })).toBeTruthy(),
    );
    expect(screen.getByText(/你尚未加入任何组织/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '前往接受邀请' })).toBeTruthy();
    expect(mocks.POST).not.toHaveBeenCalled();
    expect(mocks.GET).not.toHaveBeenCalledWith('/api/v1/subscriptions/current');
  });

  it('零组织 onboarding 提交申请 → POST /organizations/applications（body name+slug）·回执 pending 提示', async () => {
    mocks.requireSession.mockResolvedValue(session(undefined));
    stubGet([]);
    const { container } = renderAt('/');
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: '申请创建组织' })).toBeTruthy(),
    );
    fireEvent.change(container.querySelector('input[name="name"]') as HTMLInputElement, {
      target: { value: 'Acme' },
    });
    fireEvent.change(container.querySelector('input[name="slug"]') as HTMLInputElement, {
      target: { value: 'acme' },
    });
    fireEvent.click(screen.getByRole('button', { name: '申请创建组织' }));
    await vi.waitFor(() =>
      expect(mocks.POST).toHaveBeenCalledWith('/api/v1/organizations/applications', {
        body: { name: 'Acme', slug: 'acme' },
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('已提交，等待平台审批'),
    );
  });

  it('租户目录非空 → 渲双层「租户与组织」（顶层租户 + 二级组织），点击切换命中 /organizations/active', async () => {
    mocks.requireSession.mockResolvedValue(session('org-a'));
    mocks.GET.mockImplementation((path: string) => {
      if (path === '/api/v1/organizations')
        return Promise.resolve({
          data: {
            data: [
              { id: 'org-a', name: 'Acme' },
              { id: 'org-b', name: 'Beta' },
            ],
          },
          error: null,
        });
      if (path === '/api/v1/tenants')
        return Promise.resolve({
          data: {
            data: {
              tenants: [
                {
                  tenantId: 't1',
                  name: 'Acme Holdings',
                  status: 'active',
                  organizations: [
                    { organizationId: 'org-a', name: 'Acme' },
                    { organizationId: 'org-b', name: 'Beta' },
                  ],
                },
              ],
            },
          },
          error: null,
        });
      if (path === '/api/v1/subscriptions/current')
        return Promise.resolve({ data: { data: activeSub }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    renderAt('/');
    await vi.waitFor(() => expect(screen.getByText('租户：Acme Holdings')).toBeTruthy());
    const buttons = screen.getAllByRole('button', { name: '切换到此组织' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1] as HTMLElement);
    await vi.waitFor(() =>
      expect(mocks.POST).toHaveBeenCalledWith('/api/v1/organizations/active', {
        body: { organizationId: 'org-b' },
      }),
    );
  });
});

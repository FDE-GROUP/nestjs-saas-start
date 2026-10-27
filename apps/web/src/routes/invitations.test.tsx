// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * 「我的邀请」路由级集成（module-frontend-test-completion 切片 A·A-2）。
 * loader 依赖 `requireSession`（守卫）+ openapi `api.GET`（相对 URL 在 jsdom 会抛，见既有 §5 边界）——
 * 故 `vi.mock` 两模块以注入拟真 envelope，经真实 routeTree 的 memory router 打穿 loader 三分支：
 * error→ErrorPanel·ok 空→EmptyPanel·ok 有→行 + 接受/拒绝。mutation 的动作走 mock `api`，不断真网络。
 */
const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
}));

vi.mock('../lib/session', () => ({
  requireSession: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c' },
    session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
  }),
}));
vi.mock('../lib/api', () => ({
  api: { GET: mocks.GET, POST: mocks.POST, PATCH: vi.fn(), DELETE: vi.fn() },
}));

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
});

afterEach(() => {
  cleanup();
});

describe('我的邀请（路由级 · loader 三分支）', () => {
  it('loader error → ErrorPanel 展示后端文案', async () => {
    mocks.GET.mockResolvedValue({ data: null, error: { message: '邀请服务暂不可用' } });
    renderAt('/invitations');
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('邀请服务暂不可用');
    expect(mocks.GET).toHaveBeenCalledWith('/api/v1/organizations/invitations/mine');
  });

  it('loader ok 空列表 → EmptyPanel', async () => {
    mocks.GET.mockResolvedValue({ data: { data: [] }, error: null });
    renderAt('/invitations');
    await vi.waitFor(() => expect(screen.getByText('暂无待处理的邀请。')).toBeTruthy());
  });

  it('loader ok 有行 → 渲染组织名/角色 + 接受/拒绝动作', async () => {
    mocks.GET.mockResolvedValue({
      data: { data: [{ id: 'i1', email: 'x@y.z', roleKey: 'admin', organizationName: 'Acme' }] },
      error: null,
    });
    renderAt('/invitations');
    await vi.waitFor(() => expect(screen.getByText('Acme')).toBeTruthy());
    expect(screen.getByText('(admin)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '接受' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy();
  });
});

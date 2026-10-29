// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * 「我的邀请」路由级集成（module-frontend-test-completion 切片 A·A-2）。
 * loader 依赖 `requireSession`（守卫）+ typed `rpc.organizations.listMyInvitations`——【换轨 B-6】
 * 客户端拆信封直返 payload·抛错——故 `vi.mock` 两模块注入拟真 payload，经真实 routeTree 的 memory
 * router 打穿 loader 三分支：error→ErrorPanel·ok 空→EmptyPanel·ok 有→行 + 接受/拒绝。
 */
const mocks = vi.hoisted(() => ({
  listMyInvitations: vi.fn(),
}));

vi.mock('../lib/session', () => ({
  requireSession: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c' },
    session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
  }),
}));
vi.mock('../lib/api', () => ({
  rpc: { organizations: { listMyInvitations: mocks.listMyInvitations } },
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
  mocks.listMyInvitations.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('我的邀请（路由级 · loader 三分支）', () => {
  it('loader error → ErrorPanel 展示后端文案', async () => {
    mocks.listMyInvitations.mockRejectedValue({ message: '邀请服务暂不可用' });
    renderAt('/invitations');
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('邀请服务暂不可用');
    expect(mocks.listMyInvitations).toHaveBeenCalled();
  });

  it('loader ok 空列表 → EmptyPanel', async () => {
    mocks.listMyInvitations.mockResolvedValue([]);
    renderAt('/invitations');
    await vi.waitFor(() => expect(screen.getByText('暂无待处理的邀请。')).toBeTruthy());
  });

  it('loader ok 有行 → 渲染组织名/角色 + 接受/拒绝动作', async () => {
    mocks.listMyInvitations.mockResolvedValue([
      { id: 'i1', email: 'x@y.z', roleKey: 'admin', organizationName: 'Acme' },
    ]);
    renderAt('/invitations');
    await vi.waitFor(() => expect(screen.getByText('Acme')).toBeTruthy());
    expect(screen.getByText('(admin)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '接受' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy();
  });
});

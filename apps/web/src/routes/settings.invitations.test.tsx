// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../routeTree.gen';

/**
 * 「邀请管理」（管理员面·切片 A·A-2）。`/settings/invitations` 为根级路由（无嵌套父）。
 * mock `session`/`api` 注入拟真 envelope，经 memory router 打穿 loader 分支：
 * error→ErrorPanel·ok 空→发邀表单 + EmptyPanel·ok 有→撤回行。
 */
const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
}));

vi.mock('../lib/session', () => ({
  requireSession: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c' },
    session: { id: 's1', expiresAt: '' },
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
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  mocks.GET.mockReset();
  mocks.POST.mockReset();
});
afterEach(cleanup);

describe('邀请管理（路由级 · loader 分支 + 表单）', () => {
  it('loader error → ErrorPanel', async () => {
    mocks.GET.mockResolvedValue({ data: null, error: { message: '邀请列表加载失败' } });
    renderAt('/settings/invitations');
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('邀请列表加载失败');
  });

  it('loader ok 空 → 发邀表单（邮箱/角色/邀请）+ 空态', async () => {
    mocks.GET.mockResolvedValue({ data: { data: { invitations: [] } }, error: null });
    renderAt('/settings/invitations');
    await vi.waitFor(() => expect(screen.getByText('发送邀请')).toBeTruthy());
    expect(screen.getByText('暂无待处理邀请。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '邀请' })).toBeTruthy();
    expect(mocks.GET).toHaveBeenCalledWith('/api/v1/tenants/invitations');
  });

  it('loader ok 有行 → 邮箱 + 撤回动作', async () => {
    mocks.GET.mockResolvedValue({
      data: { data: [{ id: 'i1', email: 'pending@x.com', role: 'member', status: 'pending' }] },
      error: null,
    });
    renderAt('/settings/invitations');
    await vi.waitFor(() => expect(screen.getByText('pending@x.com')).toBeTruthy());
    expect(screen.getByRole('button', { name: '撤回' })).toBeTruthy();
  });
});

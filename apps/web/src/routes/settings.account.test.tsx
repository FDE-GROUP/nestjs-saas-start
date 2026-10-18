// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../routeTree.gen';

/**
 * 账号自助面（PIPL·切片 A·A-1）。`/settings/account` loader 仅 `requireSession`（无数据取）。
 * 锁：导出/注销两区块渲染 + 不可逆注销的键入闸（`confirmText!=='DELETE'` → 点击不触发 `api.DELETE`）。
 */
const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  DELETE: vi.fn(),
}));

vi.mock('../lib/session', () => ({
  requireSession: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c' },
    session: { id: 's1', expiresAt: '' },
  }),
}));
vi.mock('../lib/api', () => ({
  api: { GET: mocks.GET, POST: mocks.POST, PATCH: vi.fn(), DELETE: mocks.DELETE },
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
  mocks.DELETE.mockReset();
});
afterEach(cleanup);

describe('账号自助面（PIPL · 路由级）', () => {
  it('渲染数据导出 + 注销两区块', async () => {
    renderAt('/settings/account');
    await vi.waitFor(() => expect(screen.getByText('数据导出（PIPL 可携带权）')).toBeTruthy());
    expect(screen.getByText('注销账号（PIPL 被遗忘权）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '导出个人数据' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '永久注销' })).toBeTruthy();
  });

  it('未键入 DELETE → 点「永久注销」不触发 api.DELETE（不可逆闸）', async () => {
    renderAt('/settings/account');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '永久注销' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '永久注销' }));
    await Promise.resolve();
    expect(mocks.DELETE).not.toHaveBeenCalled();
  });
});

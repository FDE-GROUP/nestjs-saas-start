// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * 壳层 header 会话面板（auth-aware-nav-shell + header-session-affordance）：经真实 routeTree 的
 * memory router 渲 __root，mock `lib/auth` 控制会话态，钉：
 * - anon（getSession→null）→ 只显「登录」入口，不显受守卫链接、不显「登出」按钮；
 * - authed（getSession→有效会话）→ 展开控制台链接 + 邮箱 + 全局「登出」按钮，无「登录」入口；
 * - 点「登出」→ 调 signOut 一次；
 * - getSession 抛错（服务不可用）→ 降级按 anon（不崩壳层）。
 * 落 /login 路由（无 loader·不触数据面），只断言 header。
 */
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));

vi.mock('../lib/auth', () => ({
  getSession: mocks.getSession,
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signOut: mocks.signOut,
  signInMagicLink: vi.fn(),
}));

function renderAtLogin() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/login'] }),
  });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.signOut.mockReset();
});

afterEach(cleanup);

describe('壳层 header 会话面板', () => {
  it('未登录：只显「登录」入口，不显受守卫的控制台链接与登出按钮', async () => {
    mocks.getSession.mockResolvedValue(null);
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByRole('link', { name: '登录' })).toBeTruthy());
    expect(screen.queryByText('平台运营')).toBeNull();
    expect(screen.queryByText('角色权限')).toBeNull();
    expect(screen.queryByText('成员')).toBeNull();
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
    // 当前路由 /login 命中「登录」链 → aria-current="page"（active 标识机制生效）。
    expect(screen.getByRole('link', { name: '登录' }).getAttribute('aria-current')).toBe('page');
  });

  it('已登录：展开控制台导航 + 邮箱 + 全局登出，无「登录」入口', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByText('平台运营')).toBeTruthy());
    expect(screen.getByText('角色权限')).toBeTruthy();
    expect(screen.getByText('成员')).toBeTruthy();
    expect(screen.getByText('a@b.c')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登出' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '登录' })).toBeNull();
    // /login 路由下控制台链非命中 → 无 aria-current（不误激活）。
    expect(screen.getByRole('link', { name: '平台运营' }).getAttribute('aria-current')).toBeNull();
  });

  it('点「登出」→ 调 signOut 一次', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    mocks.signOut.mockResolvedValue(undefined);
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '登出' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '登出' }));
    await vi.waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  });

  it('会话服务不可用（getSession 抛错）：降级按未登录呈现，不崩壳层', async () => {
    mocks.getSession.mockRejectedValue(new Error('会话服务不可用（502）'));
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByRole('link', { name: '登录' })).toBeTruthy());
    expect(screen.queryByText('平台运营')).toBeNull();
  });
});

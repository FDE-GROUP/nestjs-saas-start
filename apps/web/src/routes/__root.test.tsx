// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * 壳层导航按登录态收口（auth-aware-nav-shell）：经真实 routeTree 的 memory router 渲 __root，
 * mock `lib/auth.getSession` 控制会话态，钉三条：
 * - anon（getSession→null）→ 只显「登录」入口，不显「平台运营/角色权限」等受守卫链接；
 * - authed（getSession→有效会话）→ 展开控制台链接，无「登录」入口；
 * - getSession 抛错（服务不可用）→ 降级按 anon（不崩壳层）。
 * 落 /login 路由（无 loader·不触数据面），只断言 header 导航。
 */
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('../lib/auth', () => ({
  getSession: mocks.getSession,
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signOut: vi.fn(),
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
});

afterEach(cleanup);

describe('壳层导航按登录态收口', () => {
  it('未登录：只显「登录」入口，不显受守卫的控制台链接', async () => {
    mocks.getSession.mockResolvedValue(null);
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByRole('link', { name: '登录' })).toBeTruthy());
    expect(screen.queryByText('平台运营')).toBeNull();
    expect(screen.queryByText('角色权限')).toBeNull();
    expect(screen.queryByText('成员')).toBeNull();
  });

  it('已登录：展开控制台导航，无「登录」入口', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByText('平台运营')).toBeTruthy());
    expect(screen.getByText('角色权限')).toBeTruthy();
    expect(screen.getByText('成员')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '登录' })).toBeNull();
  });

  it('会话服务不可用（getSession 抛错）：降级按未登录呈现，不崩壳层', async () => {
    mocks.getSession.mockRejectedValue(new Error('会话服务不可用（502）'));
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByRole('link', { name: '登录' })).toBeTruthy());
    expect(screen.queryByText('平台运营')).toBeNull();
  });
});

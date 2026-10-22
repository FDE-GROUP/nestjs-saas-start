// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * 登录后深链回跳（deep-link return）+ 开放重定向防护：mock `lib/auth` 控制会话/登录结果，
 * 经真实 routeTree 的 memory router 提交登录，断言导航落点——
 * - 合法站内 next（含查询）→ 回跳原目标；
 * - 非法 next（协议相对/外链）→ 回落首页 `/`（safeInternalPath 拦截）。
 */
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signInEmail: vi.fn() }));
vi.mock('../lib/auth', () => ({
  getSession: mocks.getSession,
  signInEmail: mocks.signInEmail,
  signUpEmail: vi.fn(),
  signOut: vi.fn(),
  signInMagicLink: vi.fn(),
}));

const SESSION = {
  user: { id: 'u1', email: 'a@b.c' },
  session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
};

function renderLoginAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return router;
}

async function submitLogin() {
  await vi.waitFor(() => expect(screen.getByLabelText('邮箱')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@b.c' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
}

// 正向回跳测的真实时序：进 /login 时 anon（表单渲染）→ 提交登录成功后才 authed（供回跳目标页 loader）。
// （反向守卫会拦截「已登录访问 /login」，若 beforeEach 恒置 authed 则挂载即弹离、表单渲不出。）
let authed = false;

beforeEach(() => {
  authed = false;
  mocks.getSession.mockImplementation(async () => (authed ? SESSION : null));
  mocks.signInEmail.mockImplementation(async () => {
    authed = true;
    return { ok: true };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('登录后深链回跳', () => {
  it('合法站内 next → 回跳原目标页', async () => {
    const router = renderLoginAt('/login?next=%2Fposts');
    await submitLogin();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
  });

  it('非法 next（协议相对外链）→ 回落首页', async () => {
    const router = renderLoginAt('/login?next=%2F%2Fevil.com');
    await submitLogin();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('已登录反向守卫（redirectIfAuthenticated）', () => {
  // 反向测需挂载即 authed（覆盖 beforeEach 的 anon-before 时序）。
  function renderAuthedAt(path: string) {
    authed = true;
    return renderLoginAt(path);
  }

  it('authed + 合法 next → 离开登录页弹回原目标', async () => {
    const router = renderAuthedAt('/login?next=%2Fposts');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
  });

  it('authed + 无 next → 回落首页', async () => {
    const router = renderAuthedAt('/login');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('authed + 非法 next（外链）→ 回落首页', async () => {
    const router = renderAuthedAt('/login?next=%2F%2Fevil.com');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('authed + register 同守卫携合法 next → 弹回原目标', async () => {
    const router = renderAuthedAt('/register?next=%2Fposts');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
  });

  it('anon + 合法 next → 停留登录页且表单可达（next 保留）', async () => {
    const router = renderLoginAt('/login?next=%2Fposts');
    await vi.waitFor(() => expect(screen.getByLabelText('邮箱')).toBeTruthy());
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ next: '/posts' });
  });
});

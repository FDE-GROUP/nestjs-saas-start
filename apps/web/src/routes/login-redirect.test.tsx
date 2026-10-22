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

beforeEach(() => {
  // 两测均需登录成功 + 登录后可达受保护页（getSession 返有效会话）。
  mocks.getSession.mockResolvedValue(SESSION);
  mocks.signInEmail.mockResolvedValue({ ok: true });
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

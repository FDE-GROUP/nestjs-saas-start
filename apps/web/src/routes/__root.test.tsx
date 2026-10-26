// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
 * anon 落 /login（无 loader）；authed 经反向守卫会被弹向 /（dashboard）——因本测只验 root 壳层，
 * 对易与 dashboard 内容重名的 email/「登出」按 banner（header）作用域限定查询。
 */
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));

vi.mock('../lib/auth', () => ({
  getSession: mocks.getSession,
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signOut: mocks.signOut,
  signInMagicLink: vi.fn(),
}));

// authed 反向守卫会把 /login 弹向 /（首页 dashboard）；其 loader 走 openapi `api.GET`，jsdom 下
// 相对 URL 的 `new Request` 必抛（已知陷阱），错误冒泡顶掉 root header。本测只验 root 会话面板，
// 故 mock `api` 数据接缝令 / 干净渲染（requireSession 内部走已 mock 的 getSession）。
vi.mock('../lib/api', () => ({
  api: {
    GET: vi.fn(async () => ({ data: { data: [] }, error: undefined })),
    POST: vi.fn(async () => ({ data: {}, error: undefined })),
  },
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

// 泛化：从任意路径初载，返回 router 以便断言重定向后的最终 location。
function renderAt(path: string) {
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
    // 响应式意图锁（防窄屏换行能力被回退）：header 小屏纵向堆叠·≥sm 单行；导航可换行。
    const header = screen.getByRole('banner');
    expect(header.className).toContain('flex-col');
    expect(header.className).toContain('sm:flex-row');
    expect(document.querySelector('nav')?.className).toContain('flex-wrap');
  });

  it('已登录：展开控制台导航 + 邮箱 + 全局登出，无「登录」入口', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByText('平台运营')).toBeTruthy());
    // authed 已被反向守卫弹向 /（dashboard 自带 email/登出）→ header 作用域限定避免重名歧义。
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('平台运营')).toBeTruthy();
    expect(within(banner).getByText('角色权限')).toBeTruthy();
    expect(within(banner).getByText('成员')).toBeTruthy();
    expect(within(banner).getByText('a@b.c')).toBeTruthy();
    expect(within(banner).getByRole('button', { name: '登出' })).toBeTruthy();
    // authed 导航同样可换行（响应式意图锁）。
    expect(banner.querySelector('nav')?.className).toContain('flex-wrap');
    expect(screen.queryByRole('link', { name: '登录' })).toBeNull();
    // 当前落 /（非 /platform/tenants）→ 控制台链非命中 → 无 aria-current（不误激活）。
    expect(
      within(banner).getByRole('link', { name: '平台运营' }).getAttribute('aria-current'),
    ).toBe(null);
  });

  it('点「登出」→ 调 signOut 一次', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    mocks.signOut.mockResolvedValue(undefined);
    renderAtLogin();
    const banner = await vi.waitFor(() => screen.getByRole('banner'));
    await vi.waitFor(() =>
      expect(within(banner).getByRole('button', { name: '登出' })).toBeTruthy(),
    );
    fireEvent.click(within(banner).getByRole('button', { name: '登出' }));
    await vi.waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  });

  it('会话服务不可用（getSession 抛错）：降级按未登录呈现，不崩壳层', async () => {
    mocks.getSession.mockRejectedValue(new Error('会话服务不可用（502）'));
    renderAtLogin();
    await vi.waitFor(() => expect(screen.getByRole('link', { name: '登录' })).toBeTruthy());
    expect(screen.queryByText('平台运营')).toBeNull();
  });
});

describe('深链守卫 beforeLoad（deep-link return）', () => {
  it('anon 命中受保护页 → 重定向 /login?next=<原路径>', async () => {
    mocks.getSession.mockResolvedValue(null);
    const router = renderAt('/posts');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toEqual({ next: '/posts' });
  });

  it('anon 携查询深链 → next 完整保留查询串', async () => {
    mocks.getSession.mockResolvedValue(null);
    const router = renderAt('/platform/tenants?q=acme');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    // 目标 route 的 validateSearch 会给 searchStr 补默认 offset，故用 stringContaining 保宽松（回跳仍为正确深链）。
    expect(router.state.location.search).toMatchObject({
      next: expect.stringContaining('/platform/tenants?q=acme'),
    });
  });

  it('anon 命中公开白名单 /register → 不重定向，停留原页', async () => {
    mocks.getSession.mockResolvedValue(null);
    const router = renderAt('/register');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/register'));
  });

  it('authed 命中受保护页 → beforeLoad 放行、不被弹回登录', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.c' },
      session: { id: 's1', expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    const router = renderAt('/posts');
    // 已登录直打受守卫 /posts：beforeLoad requireSession 通过→停留 /posts（未被弹回 /login）。
    // 仅断言落点即足以证明守卫放行（/posts loader 报错与本守卫无关，此测不接 defaultErrorComponent）。
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/posts'));
  });
});

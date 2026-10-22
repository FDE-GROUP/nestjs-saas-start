// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * settings.roles 嵌套 Outlet 委托回归锁（module-frontend-roles-outlet-delegation 切片 B·承 §4①）。
 * `settings.roles.$roleKey`（权限矩阵页）是 `/settings/roles` 的文件式子路由——修复前父 `RolesPage`
 * 无 `<Outlet/>`，命中子路由时子页永不挂载（见该 plan 的实跑探针反证）。此处经真实 routeTree 的
 * memory router 驱动父子链，锁：列表路由渲染父页且不含矩阵 h1；子路由经 Outlet 委托渲染矩阵页。
 * 手法承切片 A：`vi.mock(lib/api·lib/session)` 注入拟真 envelope·全 mock 不触网。
 */
const mocks = vi.hoisted(() => ({ GET: vi.fn() }));

vi.mock('../lib/session', () => ({
  requireSession: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c' },
    session: { id: 's1', expiresAt: '' },
  }),
}));
vi.mock('../lib/api', () => ({
  api: { GET: mocks.GET, POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

const roleRows = [
  { id: 'r1', key: 'owner', name: 'Owner', isSystem: true },
  { id: 'r2', key: 'editor', name: 'Editor', isSystem: false },
];

function mountAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.GET.mockReset().mockImplementation((path: string) => {
    if (path === '/api/v1/tenants/roles')
      return Promise.resolve({ data: { data: roleRows }, error: null });
    return Promise.resolve({ data: { data: [] }, error: null });
  });
});
afterEach(cleanup);

describe('settings.roles 父子嵌套渲染（Outlet 委托）', () => {
  it('列表路由 /settings/roles → 渲染父页列表，不含矩阵子页 h1', async () => {
    mountAt('/settings/roles');
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: '角色' })).toBeTruthy());
    expect(screen.getByRole('heading', { name: '新建自定义角色' })).toBeTruthy();
    // 未命中子路由 → 权限矩阵页不应挂载
    expect(screen.queryByRole('heading', { name: '权限矩阵' })).toBeNull();
  });

  it('子路由 /settings/roles/$roleKey → 经 Outlet 委托渲染权限矩阵页（回归锁）', async () => {
    mountAt('/settings/roles/editor');
    // 修复前此断言失败（父无 Outlet，子页永不挂载）；修复后子页 h1 + 角色行出现。
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: '权限矩阵' })).toBeTruthy());
    expect(screen.getByText(/角色：Editor（key：editor）/)).toBeTruthy();
  });
});

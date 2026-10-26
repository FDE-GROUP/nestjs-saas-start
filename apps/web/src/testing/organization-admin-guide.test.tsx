// @vitest-environment jsdom
import { ERROR_CODES } from '@saas/api-client';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * 缺活跃租户引导分派回归锁（module-frontend-organization-admin-guide·四路 loader 共用 probe 机制，
 * 此处以 roles 列表路全链打穿为锁形代表）：403 `ISOLATION:NO_ACTIVE_CONTEXT` + /organizations 空 →
 * 零组织引导文案；+ /organizations 有行 → 未激活切换文案；非该码错误 → 维持 ErrorPanel 原文。
 * 手法承 nesting 测：`vi.mock(lib/api·lib/session)` 注入拟真 envelope·全 mock 不触网。
 * 安置注：本文件放 `src/testing/` 而非 routes 同址——运行中的 dev watcher 会把 routes/ 下
 * 新增的 `*.test.tsx` 注册进 routeTree.gen（新路由语义·染坏编译），既有同址测仅因非 watcher
 * 存活期新增而未遭；属 watcher 既有行为缺口，长期宜在 vite 配置 routeFileIgnore 机制修复（本片未触）。
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

const noCtxError = {
  statusCode: 403,
  message: 'No active organization context',
  errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
};

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
    if (path === '/api/v1/organizations/roles')
      return Promise.resolve({ data: null, error: noCtxError });
    return Promise.resolve({ data: { data: [] }, error: null });
  });
});
afterEach(cleanup);

describe('缺活跃租户引导分派（/settings/roles 路由级）', () => {
  it('403 NO_ACTIVE_CONTEXT + 零组织 → 申请/等邀请引导（非死胡同原文）', async () => {
    mountAt('/settings/roles');
    await vi.waitFor(() =>
      expect(
        screen.getByText(
          '你尚未加入任何组织。请到首页提交组织申请（待平台审批），或等待管理员邀请入组。',
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByText('前往首页')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('403 NO_ACTIVE_CONTEXT + 有组织未激活 → 去切换引导', async () => {
    mocks.GET.mockImplementation((path: string) => {
      if (path === '/api/v1/organizations/roles')
        return Promise.resolve({ data: null, error: noCtxError });
      return Promise.resolve({ data: { data: [{ id: 'o1' }] }, error: null });
    });
    mountAt('/settings/roles');
    await vi.waitFor(() => expect(screen.getByText(/请到首页「租户与组织」/)).toBeTruthy());
  });

  it('非该码错误 → 维持 ErrorPanel 原文（语义不变·不吞不改）', async () => {
    mocks.GET.mockResolvedValue({
      data: null,
      error: { statusCode: 500, message: '角色列表加载失败' },
    });
    mountAt('/settings/roles');
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('角色列表加载失败');
  });
});

// @vitest-environment jsdom
import type { WorkspacePage } from '@saas/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspacesView } from './workspaces';

type WorkspacePageResponse = WorkspacePage;

const page: WorkspacePageResponse = {
  items: [
    {
      id: 'w1',
      name: 'Design',
      slug: 'design',
      organizationId: 'org-1',
      ownerId: 'u1',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

afterEach(cleanup);

// loader 的 api-client 取数（相对 URL fetch）在浏览器同源/dev 反代下运行，jsdom 的 Request
// 不解析 document base → 端到端真跑归 §5「dev 反代取证」；此处锁纯展示的 typed 契约形。
describe('WorkspacesView（纯展示 · typed 渲染 / 空态）', () => {
  it('typed 渲染名称/slug/租户/日期 + 分页计数', () => {
    render(<WorkspacesView page={page} />);
    expect(screen.getByText('Design')).toBeTruthy();
    expect(screen.getByText('design')).toBeTruthy();
    expect(screen.getByText('org-1')).toBeTruthy();
    expect(screen.getByText('2026-01-02')).toBeTruthy();
    expect(screen.getByText(/共 1 条 · 页宽 20 · 偏移 0/)).toBeTruthy();
  });

  it('空态（items 为空）', () => {
    render(<WorkspacesView page={{ items: [], total: 0, limit: 20, offset: 0 }} />);
    expect(screen.getByText('当前组织下暂无工作区。')).toBeTruthy();
  });
});

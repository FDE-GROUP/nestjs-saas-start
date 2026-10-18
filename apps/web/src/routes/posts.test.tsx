// @vitest-environment jsdom
import type { components } from '@saas/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PostsView } from './posts';

type Post = components['schemas']['PostResponse'];

const posts: Post[] = [
  {
    id: 'p1',
    title: 'Hello tenant',
    content: 'Body text here',
    published: true,
    organizationId: 'o1',
    workspaceId: null,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
  },
  {
    id: 'p2',
    title: 'Draft post',
    content: null,
    published: false,
    organizationId: 'o1',
    workspaceId: null,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
  },
];

afterEach(cleanup);

// loader 的 api-client 取数（相对 URL fetch）在浏览器同源/dev 反代下运行，jsdom 不解析 document
// base → 端到端真跑归「dev 反代取证」；此处锁纯展示的 typed 契约形。
describe('PostsView（纯展示 · typed 渲染 / 空态 / 缺省）', () => {
  it('typed 渲染标题与发布状态徽标', () => {
    render(<PostsView posts={posts} />);
    expect(screen.getByText('Hello tenant')).toBeTruthy();
    expect(screen.getByText('Draft post')).toBeTruthy();
    expect(screen.getByText('已发布')).toBeTruthy();
    expect(screen.getByText('草稿')).toBeTruthy();
  });

  it('content=null → 摘要显示占位破折号', () => {
    render(<PostsView posts={posts} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('空态（无文章）', () => {
    render(<PostsView posts={[]} />);
    expect(screen.getByText('当前租户暂无文章。')).toBeTruthy();
  });

  it('缺省（undefined）→ 空态，不崩', () => {
    render(<PostsView />);
    expect(screen.getByText('当前租户暂无文章。')).toBeTruthy();
  });
});

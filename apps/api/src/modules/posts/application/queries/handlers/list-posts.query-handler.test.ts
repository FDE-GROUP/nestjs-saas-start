import { type CursorPage, createCursorPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { describe, expect, it, vi } from 'vitest';
import { Post } from '../../../domain/entities/post';
import { ListPostsQuery } from '../list-posts.query';
import { ListPostsQueryHandler } from './list-posts.query-handler';

/**
 * posts 列表 query handler 透传测（就绪预备切片 B·游标版·分层对齐后 module-posts-domain-entity-split）：
 * 锁定 handler 把 CursorPageRequest 原样交给 port，并把 port 流回的**领域实体**逐项映射为传输投影
 * `PostReadModel`，游标信封（hasMore/nextCursor）经 `createCursorPage` 原样重建交回总线。
 */
describe('ListPostsQueryHandler · 领域实体→投影 + 游标信封透传', () => {
  it('forwards query.request to the port and maps domain Post items to PostReadModel (envelope preserved)', async () => {
    const persisted = Post.restore({
      id: 'p1',
      title: 'T',
      content: null,
      published: true,
      organizationId: 'orgA',
      workspaceId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const page: CursorPage<Post> = createCursorPage([persisted], true, 'cur-1');
    const list = vi.fn().mockResolvedValue(page);
    const handler = new ListPostsQueryHandler({ list } as never);

    const request = { limit: 4, cursor: 'prev' };
    const result = await handler.execute(new ListPostsQuery(request));

    expect(list).toHaveBeenCalledWith(request);
    // 信封语义逐字保留（hasMore/nextCursor 不因映射丢失）
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('cur-1');
    // items 已从领域实体映射为纯传输投影
    expect(result.items).toEqual([
      {
        id: 'p1',
        title: 'T',
        content: null,
        published: true,
        organizationId: 'orgA',
        workspaceId: null,
        createdAt: persisted.createdAt,
        updatedAt: persisted.updatedAt,
      },
    ]);
  });
});

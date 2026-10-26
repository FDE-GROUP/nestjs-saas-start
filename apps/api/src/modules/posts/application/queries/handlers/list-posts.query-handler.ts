import { type CursorPage, createCursorPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { POST_REPOSITORY, type PostRepository } from '../../../domain/repositories/post.repository';
import { type PostReadModel, toPostReadModel } from '../../read-models/post.read-model';
import { ListPostsQuery } from '../list-posts.query';

/**
 * 列出帖子的读侧查询处理器（经仓储端口·端口强制租户作用域）。
 *
 * @remarks
 * Read side goes through the repository port, which enforces the tenant scope
 * (global-tenancy §9.3 / FR-5). The handler itself is tenant-agnostic by design.
 *
 * 分层对齐后：port 流领域实体，本 handler 将其逐项映射为传输投影 `PostReadModel`
 * （游标信封经 `createCursorPage` 重建·hasMore/nextCursor 语义逐字不变）。
 * @public
 */
@QueryHandler(ListPostsQuery)
export class ListPostsQueryHandler
  implements IQueryHandler<ListPostsQuery, CursorPage<PostReadModel>>
{
  constructor(@Inject(POST_REPOSITORY) private readonly posts: PostRepository) {}

  /**
   * 执行列表查询：走仓储端口取当前租户内分页，逐项映射为传输投影后重建游标信封。
   * @param query - 列表查询（携游标分页请求）。
   * @returns 传输投影的游标分页信封。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListPostsQuery): Promise<CursorPage<PostReadModel>> {
    const page = await this.posts.list(query.request, query.organizationId);
    return createCursorPage(page.items.map(toPostReadModel), page.hasMore, page.nextCursor);
  }
}

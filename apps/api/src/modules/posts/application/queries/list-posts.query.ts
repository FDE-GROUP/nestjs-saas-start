import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { CursorPage, CursorPageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';
import type { PostReadModel } from '../read-models/post.read-model';

/**
 * 列出当前租户内帖子的读侧查询。
 *
 * @remarks
 * List posts within the active tenant (no tenant arg — scope is enforced downstream).
 * `organizationId` 为可选租内收窄筛选维（归属标签·非隔离轴），由控制层从查询 DTO 透传。
 * @public
 */
export class ListPostsQuery extends BaseQuery<CursorPage<PostReadModel>> {
  constructor(
    readonly request: CursorPageRequest,
    readonly organizationId?: string,
  ) {
    super();
  }
}

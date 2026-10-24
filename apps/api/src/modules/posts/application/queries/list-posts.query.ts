import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { CursorPage, CursorPageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';
import type { PostReadModel } from '../read-models/post.read-model';

/**
 * 列出当前租户内帖子的读侧查询。
 *
 * @remarks
 * List posts within the active tenant (no tenant arg — scope is enforced downstream).
 * @public
 */
export class ListPostsQuery extends BaseQuery<CursorPage<PostReadModel>> {
  constructor(readonly request: CursorPageRequest) {
    super();
  }
}

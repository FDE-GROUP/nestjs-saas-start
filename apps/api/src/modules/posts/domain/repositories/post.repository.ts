import type { CursorPage, CursorPageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';
import type { Post } from '../entities/post';

/**
 * Post repository port (domain-owned, dependency inversion).
 *
 * Deliberately exposes NO tenant/workspace parameter: the active tenant (and optional
 * workspace selector) is resolved inside the adapter from the trusted request context
 * (AsyncLocalStorage), so no caller can supply an arbitrary/foreign id. This is the single
 * choke-point for the compound `(tenant, workspace)` isolation (global-tenancy §9.3 / FR-5,
 * D2) — handlers never scatter `where organizationId/workspaceId` by hand.
 *
 * 分层对齐后端口流动**充血领域实体** `Post`（非裸记录·见 architecture「Entity Doctrine」）：
 * `create` 收业务态 `Post.draft(...)`（适配器补租户/id/时间戳落库）、`find/list` 返回复原后的完整
 * 领域实体；到传输投影 `PostReadModel` 的映射归 application，领域实体不越界进 `api/`。
 */
export const POST_REPOSITORY = Symbol('POST_REPOSITORY');

export interface PostRepository {
  /** Posts within the active tenant only, newest first（游标分页信封·(createdAt,id) 复合降序·就绪预备切片 B）。 */
  list(request: CursorPageRequest): Promise<CursorPage<Post>>;
  /** A single post within the active tenant, or null (never leaks another tenant's row). */
  findById(id: string): Promise<Post | null>;
  /** Persists a domain post (business intent), stamped with the active tenant; returns the complete entity. */
  create(post: Post): Promise<Post>;
}

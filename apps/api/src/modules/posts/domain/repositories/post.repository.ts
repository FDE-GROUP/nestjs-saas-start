import type { CursorPage, CursorPageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';
import type { Post } from '../entities/post';

/**
 * `PostRepository` 端口的 DI 注入 token（领域自持·依赖倒置）。
 * @public
 */
export const POST_REPOSITORY = Symbol('POST_REPOSITORY');

/**
 * Post 仓储端口（领域层自持·依赖倒置）。
 *
 * @remarks
 * Deliberately exposes NO tenant/workspace parameter: the active tenant (and optional
 * workspace selector) is resolved inside the adapter from the trusted request context
 * (AsyncLocalStorage), so no caller can supply an arbitrary/foreign id. This is the single
 * choke-point for the compound `(tenant, workspace)` isolation (global-tenancy §9.3 / FR-5,
 * D2) — handlers never scatter `where organizationId/workspaceId` by hand.
 *
 * rehierarchy 切片 E-F 例外（可审计）：`list` 收**可选 `organizationId` 收窄筛选维**——它是归属
 * 标签而非隔离轴，适配器仍恒以可信 `tenantId` 为主谓词再 AND 之（外来 org 只收窄至 0 行、绝不括宽/越租），
 * 故不悖离「port 不暴露租户轴」的卡点语义。
 *
 * 分层对齐后端口流动**充血领域实体** `Post`（非裸记录·见 architecture「Entity Doctrine」）：
 * `create` 收业务态 `Post.draft(...)`（适配器补租户/id/时间戳落库）、`find/list` 返回复原后的完整
 * 领域实体；到传输投影 `PostReadModel` 的映射归 application，领域实体不越界进 `api/`。
 * @public
 */
export interface PostRepository {
  /**
   * 仅列当前租户内的帖子（最新在前）。
   * @param request - 游标分页请求。
   * @param organizationId - 可选租内收窄筛选维（归属标签·非安全轴）：传值则只留该组织的行，
   * 与可信 `tenantId` 谓词 AND（外来 org 恒命中 0 行·绝不越租/括宽）；缺省即同租跨组织默认互见。
   * @returns 游标分页信封（(createdAt,id) 复合降序·就绪预备切片 B）。
   */
  list(request: CursorPageRequest, organizationId?: string): Promise<CursorPage<Post>>;
  /**
   * 取当前租户内的单帖（绝不泄露其他租户的行）。
   * @param id - 帖子主键。
   * @returns 复原后的领域实体，不存在则为 `null`。
   */
  findById(id: string): Promise<Post | null>;
  /**
   * 持久一份领域帖子（业务意图）·盖章当前租户。
   * @param post - 业务态 `Post.draft(...)`。
   * @returns 落库后的完整实体（适配器补租户/id/时间戳）。
   */
  create(post: Post): Promise<Post>;
}

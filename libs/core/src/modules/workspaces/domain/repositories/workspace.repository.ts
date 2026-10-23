import type { Page, PageRequest } from '../../../../shared-kernel/domain/pagination';

/**
 * Workspace repository port (domain-owned, dependency inversion).
 *
 * A workspace is a sub-tenant grouping (global-tenancy D2 / §9.2). Like the post port it
 * deliberately exposes NO tenant parameter: the owning tenant (organizationId) is resolved
 * inside the adapter from the trusted AsyncLocalStorage context, so no caller can target a
 * foreign tenant. This is the single choke-point for workspace isolation (FR-5) — every read
 * filters and every write stamps `organizationId`; cross-tenant id access matches 0 rows.
 *
 * Note: workspace rows are the tenant-level grouping themselves, so scoping is by
 * `organizationId` only (the `x-workspace-id` selector narrows BUSINESS data like posts, not
 * the workspace catalogue).
 */
export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

/** Write intent for a new tenant-owned workspace (primitives only, never a DTO). */
export interface WorkspaceDraft {
  name: string;
  slug: string;
  /**
   * 实例属主（module-workspace-owner-column·人裁③ additive 可选）：由 handler 侧从可信会话（ALS userId）
   *盖章，** controller body 不接受**；缺省/无上下文 → 列落 NULL（受限 grant 下 fail-closed 不可见）。
   */
  ownerId?: string;
}

/** A persisted workspace row (includes its owning tenant for transparency). */
export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  /** 实例属主；NULL/undefined = 不属任何人（存量未回填·人裁②）。 */
  ownerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceRepository {
  /**
   * Workspaces within the active tenant only（分页信封·Page<T> 契约与治理面同形）。
   *
   * `authorizationWhere`（module-rbac-query-level-filtering 切片 C·additive 可选参）：handler 侧经
   * `PermissionChecker.listPredicate` 取到的**实例授权谓词**（已解析 `{{userId}}`/`$or` 合并），
   * 由适配层以固定展开序 `{ ...authorizationWhere, organizationId }` 并入——租户盖章恒为最后键，
   * 授权谓词不可覆盖隔离卡点（FR-5 唯一卡点不变）；undefined = 无实例限制（类型级全量·现状）。
   */
  list(
    request: PageRequest,
    authorizationWhere?: Record<string, unknown>,
  ): Promise<Page<WorkspaceRecord>>;
  /** Creates a workspace stamped with the active tenant. */
  create(draft: WorkspaceDraft): Promise<WorkspaceRecord>;
  /** Updates a workspace ONLY if it belongs to the active tenant; null otherwise. */
  update(id: string, draft: Partial<WorkspaceDraft>): Promise<WorkspaceRecord | null>;
  /** Deletes a workspace ONLY if it belongs to the active tenant; false otherwise. */
  remove(id: string): Promise<boolean>;
}

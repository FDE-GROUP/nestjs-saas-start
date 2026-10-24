import type { Page, PageRequest } from '../../../../shared-kernel/domain/pagination';

/**
 * workspace 仓储端口的 DI 注入 token（领域自有·依赖倒置）。
 *
 * @remarks
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
 *
 * @public
 */
export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

/**
 * 新建租户内 workspace 的写意图（仅原语·绝非 DTO）。
 *
 * @public
 */
export interface WorkspaceDraft {
  /** 工作区名称。 */
  name: string;
  /** URL 友好的短标识。 */
  slug: string;
  /**
   * 实例属主（module-workspace-owner-column·人裁③ additive 可选）：由 handler 侧从可信会话（ALS userId）
   *盖章，** controller body 不接受**；缺省/无上下文 → 列落 NULL（受限 grant 下 fail-closed 不可见）。
   */
  ownerId?: string;
}

/**
 * 已持久化的 workspace 行（含其属主租户以保证透明）。
 *
 * @public
 */
export interface WorkspaceRecord {
  /** 工作区 id。 */
  id: string;
  /** 工作区名称。 */
  name: string;
  /** URL 友好的短标识。 */
  slug: string;
  /** 所属租户 id。 */
  organizationId: string;
  /** 实例属主；NULL/undefined = 不属任何人（存量未回填·人裁②）。 */
  ownerId?: string | null;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/**
 * workspace 仓储端口：租户内 CRUD 四原语（读侧分页 + 可选实例授权谓词下推）。
 *
 * @public
 */
export interface WorkspaceRepository {
  /**
   * Workspaces within the active tenant only（分页信封·Page<T> 契约与治理面同形）。
   *
   * @remarks
   * `authorizationWhere`（module-rbac-query-level-filtering 切片 C·additive 可选参）：handler 侧经
   * `PermissionChecker.listPredicate` 取到的**实例授权谓词**（已解析 `{{userId}}`/`$or` 合并），
   * 由适配层以固定展开序 `{ ...authorizationWhere, organizationId }` 并入——租户盖章恒为最后键，
   * 授权谓词不可覆盖隔离卡点（FR-5 唯一卡点不变）；undefined = 无实例限制（类型级全量·现状）。
   *
   * @param request - 分页请求
   * @param authorizationWhere - 可选实例授权谓词（并入租户盖章之前）
   * @returns 活动租户内的 workspace 分页信封
   */
  list(
    request: PageRequest,
    authorizationWhere?: Record<string, unknown>,
  ): Promise<Page<WorkspaceRecord>>;
  /**
   * 创建 workspace 并盖章活动租户。
   *
   * @param draft - 写意图（name/slug/ownerId）
   * @returns 新建的持久化行
   */
  create(draft: WorkspaceDraft): Promise<WorkspaceRecord>;
  /**
   * 仅当归属活动租户时更新 workspace；否则返回 null。
   *
   * @param id - 目标 workspace id
   * @param draft - 待更新字段子集
   * @returns 更新后的行；非本租/不存在返回 `null`
   */
  update(id: string, draft: Partial<WorkspaceDraft>): Promise<WorkspaceRecord | null>;
  /**
   * 仅当归属活动租户时删除 workspace；否则返回 false。
   *
   * @param id - 目标 workspace id
   * @returns 命中并删除返回 `true`；否则 `false`
   */
  remove(id: string): Promise<boolean>;
}

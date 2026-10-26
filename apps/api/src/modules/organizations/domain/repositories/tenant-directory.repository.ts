import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';

/**
 * `TenantDirectoryRepository` 端口的 DI 注入 token（领域自持·依赖倒置）。
 * @public
 */
export const TENANT_DIRECTORY_REPOSITORY = Symbol('TENANT_DIRECTORY_REPOSITORY');

/**
 * 租户目录内的组织条目（二级·归属标签）。
 * @public
 */
export interface TenantDirectoryOrganization {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
}

/**
 * 租户目录条目（顶层·隔离与计费边界 + 其下组织集合）。
 * @public
 */
export interface TenantDirectoryEntry {
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  /** 租户准入态（治理权威已上移归位 tenant.status·沿 ORGANIZATION_STATUS 值域）。 */
  readonly status: OrganizationStatus;
  readonly organizations: TenantDirectoryOrganization[];
}

/**
 * 租户目录读端口（global-tenant-organization-rehierarchy 切片 E-F）。
 *
 * @remarks
 * 把「当前用户所属成员组织」按**派生租户**归组，供前端双层切换器（顶层租户上下文 · 二级组织筛选）。
 * 与平台治理读面（`OrganizationGovernanceRepository`·天然全量跨租）正交：本面恒**用户级**——以
 * `userId` 收敛可见面（成员资格归属），绝不作为独立隔离闸（隔离裁决仍锚 ALS 可信 `tenantId`）。
 * @public
 */
export interface TenantDirectoryRepository {
  /**
   * 列当前用户可见的租户目录（每租携其下该用户可见的组织集合）。
   * @param userId - 会话用户 id（成员资格收敛输入）。
   * @returns 归组后的租户条目数组（无成员资格即空数组）。
   */
  listForUser(userId: string): Promise<TenantDirectoryEntry[]>;
}

import { z } from 'zod';
import { TENANCY_STATUS_VALUES } from './organizations';

/**
 * 租户目录响应契约（global-tenant-organization-rehierarchy 切片 E-F·前端双层切换器数据源）。
 *
 * @remarks
 * 真相源 = apps 侧 `TenantDirectoryEntry[]`（经 `@saas/contracts` 对拍测锁漂移）。定位：把当前用户
 * 的成员组织按**派生租户**归组——顶层说租户（隔离与计费边界）、二级说组织（绑一家 Odoo 公司）。
 * 只暴露目录导航所需的标识/准入态，不含计费/成员明细（走各自面）。
 */

/**
 * 租户目录内的组织条目（二级·归属标签）。
 *
 * @public
 */
export const tenantDirectoryOrganizationViewSchema = z.object({
  /** 组织主键（二级轴·绑一家 Odoo 公司）。 */
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type TenantDirectoryOrganizationView = z.infer<typeof tenantDirectoryOrganizationViewSchema>;

/**
 * 租户目录条目（顶层·隔离与计费边界 + 其下组织集合）。
 *
 * @public
 */
export const tenantDirectoryEntryViewSchema = z.object({
  /** 租户主键（隔离主轴）。 */
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  /** 租户准入态（治理权威已上移归位 tenant.status·沿 TENANCY_STATUS 值域）。 */
  status: z.enum(TENANCY_STATUS_VALUES),
  /** 该租户下当前用户可见的组织集合（同租跨组织默认互见）。 */
  organizations: z.array(tenantDirectoryOrganizationViewSchema),
});
export type TenantDirectoryEntryView = z.infer<typeof tenantDirectoryEntryViewSchema>;

/**
 * 租户目录整体响应（`GET /tenants` 信封 data 面）。
 *
 * @public
 */
export const tenantDirectoryViewSchema = z.object({
  tenants: z.array(tenantDirectoryEntryViewSchema),
});
export type TenantDirectoryView = z.infer<typeof tenantDirectoryViewSchema>;

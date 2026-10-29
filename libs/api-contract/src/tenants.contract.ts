/**
 * tenants 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 租户目录读面（列当前用户可见租户→组织）+ 会话租激活位写入。跨租可见（`@TenantIsolationExempt`
 * 类级旁路租户墙·handler 留 apps/api）·逐路由 SessionGuard 保会话必需。契约携 zod 输入/输出
 * （`@saas/contracts` 单源）+ `openapi` meta（meta 与 apps/api `os` server procedure 共享同物体）。
 */
import {
  activeTenantResultSchema,
  setActiveTenantSchema,
  tenantDirectoryViewSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const tenantsListMeta = openapi({
  method: 'GET',
  path: '/tenants',
  summary: 'List tenant directory of the current user (tenants → organizations)',
});
export const tenantsSetActiveMeta = openapi({
  method: 'PUT',
  path: '/tenants/active',
  summary: 'Set the active tenant of the current session (tenant activation)',
});

export const tenantsListContract = oc.output(tenantDirectoryViewSchema).meta(tenantsListMeta);
export const tenantsSetActiveContract = oc
  .input(setActiveTenantSchema)
  .output(activeTenantResultSchema)
  .meta(tenantsSetActiveMeta);

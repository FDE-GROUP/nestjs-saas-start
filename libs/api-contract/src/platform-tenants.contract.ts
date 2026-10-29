/**
 * platform-tenants 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 平台操作员治理切片（多租户 S5·治理台改锚 tenant 主键）：列表/详情/暂停/恢复/可见性/软删/硬删 + org 下钻诊断/导出。
 * 全线 `PlatformOperatorGuard`（唯一跨租权威·fail-closed）·故意无租户作用域——守卫留 apps/api。`:tenantId`/`:orgId`
 * 路径参经紧凑 input 合并（纯参=`platformTenantIdParamSchema`·body⊕参=`setTenantOrgVisibilityInputSchema`·
 * 下钻双参=`platformOrgDrilldownParamSchema`）。exportData M4-b 挂 `.output`（`organizationDataExportViewSchema`·顶层骨架防脆）。in-handler `NotFoundException` 经 WP-D 承接。
 */
import {
  listPlatformTenantsQuerySchema,
  organizationDataExportViewSchema,
  organizationDiagnosticsSchema,
  platformOrgDrilldownParamSchema,
  platformTenantDetailSchema,
  platformTenantIdParamSchema,
  platformTenantPageSchema,
  setTenantOrgVisibilityInputSchema,
  tenantGovernanceResultSchema,
  tenantHardDeleteResultSchema,
  tenantOrgVisibilityResultSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const platformTenantsListMeta = openapi({
  method: 'GET',
  path: '/platform/tenants',
  summary: 'List all tenants across the platform (operator only)',
});
export const platformTenantsDetailMeta = openapi({
  method: 'GET',
  path: '/platform/tenants/:tenantId',
  summary: 'Get one tenant with its organization roster (operator only)',
});
export const platformTenantsSuspendMeta = openapi({
  method: 'PATCH',
  path: '/platform/tenants/:tenantId/suspend',
  summary: 'Suspend an active tenant (active → suspended · blocks the whole tenant)',
});
export const platformTenantsResumeMeta = openapi({
  method: 'PATCH',
  path: '/platform/tenants/:tenantId/resume',
  summary: 'Resume a suspended tenant (suspended → active)',
});
export const platformTenantsVisibilityMeta = openapi({
  method: 'PATCH',
  path: '/platform/tenants/:tenantId/visibility',
  summary: "Set the tenant's intra-tenant organization visibility policy (shared ⇄ isolated)",
});
export const platformTenantsRemoveMeta = openapi({
  method: 'DELETE',
  path: '/platform/tenants/:tenantId',
  summary:
    'Soft-delete a tenant (→ deleted terminal · blocks the whole tenant · row kept for export)',
});
export const platformTenantsPermanentRemoveMeta = openapi({
  method: 'DELETE',
  path: '/platform/tenants/:tenantId/permanent',
  summary:
    'Hard-delete a deleted-terminal tenant (irreversible · cascade purge of all its orgs + event purge · NFR-6)',
});
export const platformTenantsDiagnosticsMeta = openapi({
  method: 'GET',
  path: '/platform/tenants/:tenantId/organizations/:orgId/diagnostics',
  summary: 'Per-organization diagnostics: member/invitation/workspace/post counts (drill-down)',
});
export const platformTenantsExportMeta = openapi({
  method: 'GET',
  path: '/platform/tenants/:tenantId/organizations/:orgId/export',
  summary: 'Export all organization-owned data as a single JSON payload (NFR-6 · drill-down)',
});

export const platformTenantsListContract = oc
  .input(listPlatformTenantsQuerySchema)
  .output(platformTenantPageSchema)
  .meta(platformTenantsListMeta);
export const platformTenantsDetailContract = oc
  .input(platformTenantIdParamSchema)
  .output(platformTenantDetailSchema)
  .meta(platformTenantsDetailMeta);
export const platformTenantsSuspendContract = oc
  .input(platformTenantIdParamSchema)
  .output(tenantGovernanceResultSchema)
  .meta(platformTenantsSuspendMeta);
export const platformTenantsResumeContract = oc
  .input(platformTenantIdParamSchema)
  .output(tenantGovernanceResultSchema)
  .meta(platformTenantsResumeMeta);
export const platformTenantsVisibilityContract = oc
  .input(setTenantOrgVisibilityInputSchema)
  .output(tenantOrgVisibilityResultSchema)
  .meta(platformTenantsVisibilityMeta);
export const platformTenantsRemoveContract = oc
  .input(platformTenantIdParamSchema)
  .output(tenantGovernanceResultSchema)
  .meta(platformTenantsRemoveMeta);
export const platformTenantsPermanentRemoveContract = oc
  .input(platformTenantIdParamSchema)
  .output(tenantHardDeleteResultSchema)
  .meta(platformTenantsPermanentRemoveMeta);
export const platformTenantsDiagnosticsContract = oc
  .input(platformOrgDrilldownParamSchema)
  .output(organizationDiagnosticsSchema)
  .meta(platformTenantsDiagnosticsMeta);
export const platformTenantsExportContract = oc
  .input(platformOrgDrilldownParamSchema)
  .output(organizationDataExportViewSchema)
  .meta(platformTenantsExportMeta);

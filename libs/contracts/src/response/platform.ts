import { z } from 'zod';
import {
  ORG_VISIBILITY_VALUES,
  ORGANIZATION_ODOO_BINDING_STATUS_VALUES,
  TENANT_STATUS_VALUES,
} from './organizations';
import { offsetPageSchema } from './page';

/**
 * 平台治理面响应契约（S7b·真相源 = platform-tenants / platform-users 各 controller 返回类型·
 * apps 侧编译期双向赋值锁锚定）。状态词汇复用 `TENANT_STATUS_VALUES`（UserStatus ≡ TenantStatus 别名）。
 *
 * rehierarchy 片一（治理台改锚 tenant）：跨租治理列表/详情/生命周期改以 **tenant 主键**
 * （审批准入态权威归位住 `tenant.status`·切片 E）；组织降级为租户名册下的下钻/绑定面（诊断/Odoo 绑定仍 org 级）。
 */

/**
 * 平台侧租户列表行视图（tenant 主键·准入态权威·名下组织计数）。
 *
 * @public
 */
export const platformTenantRowSchema = z.object({
  /** tenant 主键（隔离与计费边界）。 */
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  /** 租户准入生命周期状态（无记录视同 active）。 */
  status: z.enum(TENANT_STATUS_VALUES),
  /** 该租户名下组织数量（一租多组织可见）。 */
  organizationCount: z.number(),
  createdAt: z.instanceof(Date),
});
export type PlatformTenantRowView = z.infer<typeof platformTenantRowSchema>;

/**
 * offset 分页整体响应（`Page<PlatformTenantRow>`）。
 *
 * @public
 */
export const platformTenantPageSchema = offsetPageSchema(platformTenantRowSchema);

/**
 * 租户名册下的组织条目（下钻/绑定面·一组织一公司）。Odoo 绑定列可空（未绑定时 null）。
 *
 * @public
 */
export const platformTenantOrganizationSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(TENANT_STATUS_VALUES),
  odooCompanyId: z.number().int().nullable(),
  odooBindingStatus: z.enum(ORGANIZATION_ODOO_BINDING_STATUS_VALUES).nullable(),
  odooCompanyName: z.string().nullable(),
});
export type PlatformTenantOrganizationView = z.infer<typeof platformTenantOrganizationSchema>;

/**
 * 平台侧租户详情视图（租户基本盘 + 名下组织名册）。
 *
 * @public
 */
export const platformTenantDetailSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(TENANT_STATUS_VALUES),
  createdAt: z.instanceof(Date),
  organizations: z.array(platformTenantOrganizationSchema),
});
export type PlatformTenantDetailView = z.infer<typeof platformTenantDetailSchema>;

/**
 * 组织身份下钻行（诊断快照的 organization 段·平台治理台以 tenant 锚定后仅留此轻形供 org 级诊断）。
 *
 * @public
 */
export const platformOrganizationDrillRowSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(TENANT_STATUS_VALUES),
  createdAt: z.instanceof(Date),
});

/**
 * 按组织诊断快照（关联计数·平台运维下钻核对用·org 级·经租户详情抵达）。
 *
 * @public
 */
export const organizationDiagnosticsSchema = z.object({
  organization: platformOrganizationDrillRowSchema,
  memberCount: z.number(),
  invitationCount: z.number(),
  workspaceCount: z.number(),
  postCount: z.number(),
});

/**
 * 租户生命周期治理结果（approve/suspend/resume/delete 迁移后回执·tenant 主键）。
 *
 * @public
 */
export const tenantGovernanceResultSchema = z.object({
  /** 目标租户 id。 */
  tenantId: z.string(),
  status: z.enum(TENANT_STATUS_VALUES),
});
export type TenantGovernanceResultView = z.infer<typeof tenantGovernanceResultSchema>;

/**
 * 租内跨组织可见性策略设置回执（第三次复裁切片 3·tenant 主键）。
 *
 * @public
 */
export const tenantOrgVisibilityResultSchema = z.object({
  /** 目标租户 id。 */
  tenantId: z.string(),
  /** 设置后的租内可见性策略。 */
  orgVisibility: z.enum(ORG_VISIBILITY_VALUES),
});
export type TenantOrgVisibilityResultView = z.infer<typeof tenantOrgVisibilityResultSchema>;

/**
 * 租户硬删除结果（连带清除该租户名下所有组织·供审计核对）。
 *
 * @public
 */
export const tenantHardDeleteResultSchema = z.object({
  /** 被硬删的 tenant 主键。 */
  tenantId: z.string(),
  /** 本次连带消灭的组织行数（一租多组织）。 */
  purgedOrgs: z.number(),
  /** 本次清除的 lifecycle 事件数（供审计核对）。 */
  purgedEvents: z.number(),
});
export type TenantHardDeleteResultView = z.infer<typeof tenantHardDeleteResultSchema>;

/**
 * 平台侧用户列表行视图。
 *
 * @public
 */
export const platformUserRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  /** 治理状态（无记录视同 active）。 */
  status: z.enum(TENANT_STATUS_VALUES),
  createdAt: z.instanceof(Date),
});
export type PlatformUserRowView = z.infer<typeof platformUserRowSchema>;

/**
 * offset 分页整体响应（`Page<PlatformUserRow>`）。
 *
 * @public
 */
export const platformUserPageSchema = offsetPageSchema(platformUserRowSchema);

/**
 * 用户治理操作结果（迁移后的新状态）。
 *
 * @public
 */
export const userGovernanceResultSchema = z.object({
  userId: z.string(),
  /** 迁移后的新状态。 */
  status: z.enum(TENANT_STATUS_VALUES),
});

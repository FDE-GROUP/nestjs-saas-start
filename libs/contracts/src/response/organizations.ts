import { z } from 'zod';

/**
 * 租户生命周期状态 wire 值集（**传输层内联单源**）。
 *
 * @remarks
 * ⚠ 状态值域 SSOT 在 `@core` TENANT_STATUS·此处内联字面量由 contracts-vocab-parity 对拍锁漂移。
 *
 * @public
 */
export const TENANT_STATUS_VALUES = ['pending_approval', 'active', 'suspended', 'deleted'] as const;

/**
 * 租内跨组织可见性策略 wire 值集（**传输层内联单源**·第三次复裁切片 3）。
 *
 * @remarks
 * ⚠ 值域 SSOT 在 `@core` ORG_VISIBILITY·此处内联字面量由 contracts-vocab-parity 对拍锁漂移（沿
 * `TENANT_STATUS_VALUES` 同法）。`shared`=同租内跨组织默认互见（缺省·零行为变更）·`isolated`=租内互不可见。
 *
 * @public
 */
export const ORG_VISIBILITY_VALUES = ['shared', 'isolated'] as const;

/**
 * 租户申请/生命周期视图（S7b·真相源 = `OrganizationApplicationReadModel`·
 * 复用于 tenants apply/approve + platform suspend/resume/delete）。
 *
 * @public
 */
export const organizationApplicationViewSchema = z.object({
  /** organization 主键（= 租户 id）。 */
  organizationId: z.string(),
  status: z.enum(TENANT_STATUS_VALUES),
});
export type OrganizationApplicationView = z.infer<typeof organizationApplicationViewSchema>;

/**
 * Odoo 公司绑定态 wire 值集（**传输层内联单源**）。
 *
 * @remarks
 * ⚠ 状态值域 SSOT 在 `@core` ORGANIZATION_ODOO_BINDING_STATUS·此处内联字面量由
 * contracts-vocab-parity 对拍锁漂移（沿 `TENANT_STATUS_VALUES` 同法）。
 *
 * @public
 */
export const ORGANIZATION_ODOO_BINDING_STATUS_VALUES = [
  'pending',
  'provisioning',
  'ready',
  'failed',
] as const;

/**
 * 租户↔Odoo 公司绑定视图（module-org-odoo-company-mapping 切片 A·bind-existing 回执）。
 *
 * @remarks
 * 真相源 = `OrganizationOdooBindingReadModel`；只暴露映射档案，
 * 公司实体数据（单据/伙伴等）仍走 odoo-rpc-api 域注入面，不经本视图透传。
 *
 * @public
 */
export const organizationOdooBindingViewSchema = z.object({
  organizationId: z.string(),
  odooCompanyId: z.number().int().positive(),
  odooBindingStatus: z.enum(ORGANIZATION_ODOO_BINDING_STATUS_VALUES),
  odooCompanyName: z.string().nullable(),
  odooBoundAt: z.instanceof(Date).nullable(),
});
export type OrganizationOdooBindingView = z.infer<typeof organizationOdooBindingViewSchema>;

/**
 * 当前活跃租户的 Odoo 可用性视图（module-org-odoo-company-mapping 切片 D · apps 面板数据源）。
 *
 * @remarks
 * 前端 apps 面板按绑定态渲染（可用/开通中/失败/未开通）的唯一读面；`available`
 * 与后端 SSO/RPC 门禁同一 `canUseOdoo` 单源裁决（三点门禁口径不漂移）。字段均为只读展示用·
 * `odooBindingStatus=null` 表未绑定（存量/演示行）。**不**含公司实体数据（走 odoo-rpc-api 域注入面）。
 *
 * @public
 */
export const organizationOdooAvailabilityViewSchema = z.object({
  /** Odoo 能力当前对该租户是否可用（`canUseOdoo` 裁决结果）。 */
  available: z.boolean(),
  /** 绑定生命周期态（null=未绑定/无活跃租户）。 */
  odooBindingStatus: z.enum(ORGANIZATION_ODOO_BINDING_STATUS_VALUES).nullable(),
  /** 绑定的 Odoo 公司 id（无绑定即 null）。 */
  odooCompanyId: z.number().int().positive().nullable(),
});
export type OrganizationOdooAvailabilityView = z.infer<
  typeof organizationOdooAvailabilityViewSchema
>;

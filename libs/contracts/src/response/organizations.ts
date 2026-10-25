import { z } from 'zod';

/**
 * 租户生命周期状态 wire 值集（**传输层内联单源**）。
 *
 * @remarks
 * ⚠ 状态值域 SSOT 在 `@core` ORGANIZATION_STATUS·此处内联字面量由 contracts-vocab-parity 对拍锁漂移。
 *
 * @public
 */
export const ORGANIZATION_STATUS_VALUES = [
  'pending_approval',
  'active',
  'suspended',
  'deleted',
] as const;

/**
 * 租户申请/生命周期视图（S7b·真相源 = `OrganizationApplicationReadModel`·
 * 复用于 tenants apply/approve + platform suspend/resume/delete）。
 *
 * @public
 */
export const organizationApplicationViewSchema = z.object({
  /** organization 主键（= 租户 id）。 */
  organizationId: z.string(),
  status: z.enum(ORGANIZATION_STATUS_VALUES),
});
export type OrganizationApplicationView = z.infer<typeof organizationApplicationViewSchema>;

/**
 * Odoo 公司绑定态 wire 值集（**传输层内联单源**）。
 *
 * @remarks
 * ⚠ 状态值域 SSOT 在 `@core` ORGANIZATION_ODOO_BINDING_STATUS·此处内联字面量由
 * contracts-vocab-parity 对拍锁漂移（沿 `ORGANIZATION_STATUS_VALUES` 同法）。
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

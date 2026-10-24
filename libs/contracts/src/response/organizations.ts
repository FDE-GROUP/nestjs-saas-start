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

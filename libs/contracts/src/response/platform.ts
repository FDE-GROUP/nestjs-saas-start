import { z } from 'zod';
import { ORGANIZATION_STATUS_VALUES } from './organizations';
import { offsetPageSchema } from './page';

/**
 * 平台治理面响应契约（S7b·真相源 = platform-tenants / platform-users 各 controller 返回类型·
 * apps 侧编译期双向赋值锁锚定）。状态词汇复用 `ORGANIZATION_STATUS_VALUES`（UserStatus ≡ OrganizationStatus 别名）。
 */

/**
 * 平台侧租户列表行视图。
 *
 * @public
 */
export const platformOrganizationRowSchema = z.object({
  /** organization 主键（= 租户 id）。 */
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  /** 生命周期状态（无记录视同 active）。 */
  status: z.enum(ORGANIZATION_STATUS_VALUES),
  createdAt: z.instanceof(Date),
});
export type PlatformOrganizationRowView = z.infer<typeof platformOrganizationRowSchema>;

/**
 * offset 分页整体响应（`Page<PlatformOrganizationRow>`）。
 *
 * @public
 */
export const platformOrganizationPageSchema = offsetPageSchema(platformOrganizationRowSchema);

/**
 * 租户诊断快照（关联计数·平台运维核对用）。
 *
 * @public
 */
export const organizationDiagnosticsSchema = z.object({
  organization: platformOrganizationRowSchema,
  memberCount: z.number(),
  invitationCount: z.number(),
  workspaceCount: z.number(),
  postCount: z.number(),
});

/**
 * 租户硬删除结果（供审计核对）。
 *
 * @public
 */
export const organizationHardDeleteResultSchema = z.object({
  /** 被硬删的 organization 主键。 */
  organizationId: z.string(),
  /** 本次清除的 lifecycle 事件数（供审计核对）。 */
  purgedEvents: z.number(),
});

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
  status: z.enum(ORGANIZATION_STATUS_VALUES),
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
  status: z.enum(ORGANIZATION_STATUS_VALUES),
});

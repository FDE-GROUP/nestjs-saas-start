import { z } from 'zod';
import { offsetPageSchema } from './page';
import { ORGANIZATION_STATUS_VALUES } from './tenants';

/**
 * 平台治理面响应契约（S7b·真相源 = platform-tenants / platform-users 各 controller 返回类型·
 * apps 侧编译期双向赋值锁锚定）。状态词汇复用 `ORGANIZATION_STATUS_VALUES`（UserStatus ≡ OrganizationStatus 别名）。
 */
export const platformTenantRowSchema = z.object({
  /** organization 主键（= 租户 id）。 */
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  /** 生命周期状态（无记录视同 active）。 */
  status: z.enum(ORGANIZATION_STATUS_VALUES),
  createdAt: z.instanceof(Date),
});
export type PlatformTenantRowView = z.infer<typeof platformTenantRowSchema>;

/** offset 分页整体响应（`Page<PlatformTenantRow>`）。 */
export const platformTenantPageSchema = offsetPageSchema(platformTenantRowSchema);

export const tenantDiagnosticsSchema = z.object({
  tenant: platformTenantRowSchema,
  memberCount: z.number(),
  invitationCount: z.number(),
  workspaceCount: z.number(),
  postCount: z.number(),
});

export const tenantHardDeleteResultSchema = z.object({
  /** 被硬删的 organization 主键。 */
  organizationId: z.string(),
  /** 本次清除的 lifecycle 事件数（供审计核对）。 */
  purgedEvents: z.number(),
});

export const platformUserRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  /** 治理状态（无记录视同 active）。 */
  status: z.enum(ORGANIZATION_STATUS_VALUES),
  createdAt: z.instanceof(Date),
});
export type PlatformUserRowView = z.infer<typeof platformUserRowSchema>;

/** offset 分页整体响应（`Page<PlatformUserRow>`）。 */
export const platformUserPageSchema = offsetPageSchema(platformUserRowSchema);

export const userGovernanceResultSchema = z.object({
  userId: z.string(),
  /** 迁移后的新状态。 */
  status: z.enum(ORGANIZATION_STATUS_VALUES),
});

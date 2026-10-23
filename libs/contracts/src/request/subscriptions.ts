import { z } from 'zod';
import { strictObject } from '../strict';

/**
 * 订阅档位 id（**传输层 wire enum 单源**）。
 * ⚠ 领域档位目录 SSOT 在 `@core/saas-kit/modules/subscriptions/quota/organization-plans`（`ORGANIZATION_PLANS` 键）；
 * contracts 保持零依赖，内联同一键集，由 apps/api `contracts-vocab-parity.test.ts` 对拍锁定，防漂移。
 */
export const TENANT_PLAN_IDS = ['free', 'pro', 'enterprise'] as const;

/**
 * 开通/改档订阅入参（旧 `CreateSubscriptionDto`·@Body JSON·S7 FR-7/FR-8）。
 * `plan` 限档位目录内；`customerEmail` 旧 `@IsEmail`（无 key→默认英文·此处同）；
 * 三个 quota 字段旧 `@Transform(Number)+@IsInt+@Min` → `z.coerce.number().int().min()`（缺省取档位目录·显式传则覆盖）。
 */
export const createSubscriptionSchema = strictObject({
  plan: z.enum(TENANT_PLAN_IDS),
  customerEmail: z.string().email().max(254),
  seatsLimit: z.coerce.number().int().min(1).optional(),
  storageQuota: z.coerce.number().int().min(0).optional(),
  apiQuota: z.coerce.number().int().min(0).optional(),
});
export type CreateSubscription = z.infer<typeof createSubscriptionSchema>;

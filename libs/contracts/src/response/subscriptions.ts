import { z } from 'zod';

/**
 * 订阅/配额视图（S7b·真相源 = `OrganizationSubscriptionView (≡ SeatQuotaSnapshot)`）。
 *
 * @public
 */
export const subscriptionViewSchema = z.object({
  /** 是否已有生效订阅。 */
  hasSubscription: z.boolean(),
  /** 生效档位 plan key（缺订阅回落 FREE_PLAN）。 */
  plan: z.string(),
  /** 座位上限。 */
  seatsLimit: z.number(),
  /** 已用座位（= 成员数·实时算）。 */
  used: z.number(),
  /** 剩余座位。 */
  remaining: z.number(),
  /** 支付通道 customer id；无订阅 = null。 */
  providerCustomerId: z.string().nullable(),
});
export type SubscriptionView = z.infer<typeof subscriptionViewSchema>;

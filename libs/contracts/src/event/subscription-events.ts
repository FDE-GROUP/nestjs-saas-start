import { z } from 'zod';
import { strictObject } from '../strict';

/**
 * subscription 流事件 payload 契约单源（ES R4 第二上下文推广 ·
 * module-es-r4-second-context-subscriptions §2 裁ⓒ · 裁⑥甲 · 沿 tenant-events 先例）。
 *
 * 定位：event store「回放即真相」的被回放载荷 = 跨时间契约（upcast 键 = 外层信封
 * `eventVersion`），故 zod schema 居 `@saas/contracts` 单源；事件**类**仍在
 * `@core/saas-kit`（领域形态），两侧一致性由 apps/api 对拍测锁定
 * （`subscription-event-contract.test.ts`·双向赋值锁先例）。
 *
 * wire enum 内联纪律（contracts 零依赖 @core）：`SUBSCRIPTION_STATUS_WIRE` 值集与
 * `@core` `SUBSCRIPTION_STATUS` 的一致性由对拍测锁漂移，非 import。
 */
export const SUBSCRIPTION_STATUS_WIRE = ['active', 'suspended', 'expired', 'cancelled'] as const;

/** subscription 流事件名（与 @core `DOMAIN_EVENTS` 三键一致性由对拍测锁）。 */
export const SUBSCRIPTION_EVENT_TYPES_WIRE = {
  statusTransitioned: 'subscription.status.transitioned',
  created: 'subscription.created',
  bootstrapped: 'subscription.bootstrapped',
} as const;

/** `subscription.status.transitioned` v1 payload（from=迁移前态·空流起点为 null）。 */
export const subscriptionStatusTransitionedPayloadSchema = strictObject({
  from: z.union([z.enum(SUBSCRIPTION_STATUS_WIRE), z.null()]),
  to: z.enum(SUBSCRIPTION_STATUS_WIRE),
  actorId: z.string().optional(),
  reason: z.string().optional(),
});
export type SubscriptionStatusTransitionedEventPayload = z.infer<
  typeof subscriptionStatusTransitionedPayloadSchema
>;

/** `subscription.created` v1 payload（流起点·status 初态·plan 非 PII opaque 码）。 */
export const subscriptionCreatedPayloadSchema = strictObject({
  plan: z.string(),
  status: z.enum(SUBSCRIPTION_STATUS_WIRE),
  actorId: z.string().optional(),
});
export type SubscriptionCreatedEventPayload = z.infer<typeof subscriptionCreatedPayloadSchema>;

/** `subscription.bootstrapped` v1 payload（存量成流快照·流起点·payload 仅治理态 + opaque 计划码）。 */
export const subscriptionBootstrappedPayloadSchema = strictObject({
  status: z.enum(SUBSCRIPTION_STATUS_WIRE),
  plan: z.string().optional(),
  actorId: z.string().optional(),
});
export type SubscriptionBootstrappedEventPayload = z.infer<
  typeof subscriptionBootstrappedPayloadSchema
>;

import { z } from 'zod';
import { strictObject } from '../strict';

/**
 * tenant 流事件 payload 契约单源（ES R1a · module-es-r1-replay-core §3-R1a · 裁⑥甲）。
 *
 * 定位：event store「回放即真相」的被回放载荷 = 跨时间契约（upcast 键 = 外层信封
 * `eventVersion`），故 zod schema 居 `@saas/contracts` 单源；事件**类**仍在
 * `@core/saas-kit`（领域形态），两侧一致性由 apps/api 对拍测锁定
 * （`organization-event-contract.test.ts`·双向赋值锁先例）。
 *
 * wire enum 内联纪律（contracts 零依赖 @core·见 index.ts 头注）：`ORGANIZATION_STATUS_WIRE`
 * 值集与 `@core` `ORGANIZATION_STATUS` 的一致性由对拍测锁漂移，非 import。
 */
export const ORGANIZATION_STATUS_WIRE = [
  'pending_approval',
  'active',
  'suspended',
  'deleted',
] as const;

/** tenant 流事件名（与 @core `DOMAIN_EVENTS` 三键一致性由对拍测锁）。 */
export const ORGANIZATION_EVENT_TYPES_WIRE = {
  statusTransitioned: 'tenant.status.transitioned',
  rejected: 'tenant.rejected',
  bootstrapped: 'tenant.bootstrapped',
} as const;

/** `tenant.status.transitioned` v1 payload（from=迁移前态·无记录历史为 null）。 */
export const organizationStatusTransitionedPayloadSchema = strictObject({
  from: z.union([z.enum(ORGANIZATION_STATUS_WIRE), z.null()]),
  to: z.enum(ORGANIZATION_STATUS_WIRE),
  actorId: z.string().optional(),
  reason: z.string().optional(),
});
export type OrganizationStatusTransitionedEventPayload = z.infer<
  typeof organizationStatusTransitionedPayloadSchema
>;

/** `tenant.rejected` v1 payload（驳回审计事实·PII 最小：不携申请内容）。 */
export const organizationRejectedPayloadSchema = strictObject({
  actorId: z.string().optional(),
  reason: z.string().optional(),
});
export type OrganizationRejectedEventPayload = z.infer<typeof organizationRejectedPayloadSchema>;

/** `tenant.bootstrapped` v1 payload（R1b 存量成流快照·流起点·payload 仅治理态）。 */
export const organizationBootstrappedPayloadSchema = strictObject({
  status: z.enum(ORGANIZATION_STATUS_WIRE),
  actorId: z.string().optional(),
});
export type OrganizationBootstrappedEventPayload = z.infer<
  typeof organizationBootstrappedPayloadSchema
>;

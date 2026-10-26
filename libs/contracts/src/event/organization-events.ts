import { z } from 'zod';
import { strictObject } from '../strict';

/**
 * tenant 流生命周期状态 wire 枚举值集（tenant 流事件 payload 契约单源的一部分）。
 *
 * @remarks
 * 定位：event store「回放即真相」的被回放载荷 = 跨时间契约（upcast 键 = 外层信封
 * `eventVersion`），故 zod schema 居 `@saas/contracts` 单源；事件**类**仍在
 * `@core/saas-kit`（领域形态），两侧一致性由 apps/api 对拍测锁定
 * （`organization-event-contract.test.ts`·双向赋值锁先例）。
 *
 * wire enum 内联纪律（contracts 零依赖 `@core`·见 index.ts 头注）：`TENANCY_STATUS_WIRE`
 * 值集与 `@core` 的 `TENANCY_STATUS` 一致性由对拍测锁漂移，非 import。
 *
 * @public
 */
export const TENANCY_STATUS_WIRE = ['pending_approval', 'active', 'suspended', 'deleted'] as const;

/**
 * tenant 流事件名 wire 单源（与 `@core` 的 `DOMAIN_EVENTS` 三键一致性由对拍测锁）。
 *
 * @public
 */
export const ORGANIZATION_EVENT_TYPES_WIRE = {
  statusTransitioned: 'tenant.status.transitioned',
  rejected: 'tenant.rejected',
  bootstrapped: 'tenant.bootstrapped',
} as const;

/**
 * `tenant.status.transitioned` v1 payload（from=迁移前态·无记录历史为 null）。
 *
 * @public
 */
export const organizationStatusTransitionedPayloadSchema = strictObject({
  from: z.union([z.enum(TENANCY_STATUS_WIRE), z.null()]),
  to: z.enum(TENANCY_STATUS_WIRE),
  actorId: z.string().optional(),
  reason: z.string().optional(),
});
export type OrganizationStatusTransitionedEventPayload = z.infer<
  typeof organizationStatusTransitionedPayloadSchema
>;

/**
 * `tenant.rejected` v1 payload（驳回审计事实·PII 最小：不携申请内容）。
 *
 * @public
 */
export const organizationRejectedPayloadSchema = strictObject({
  actorId: z.string().optional(),
  reason: z.string().optional(),
});
export type OrganizationRejectedEventPayload = z.infer<typeof organizationRejectedPayloadSchema>;

/**
 * `tenant.bootstrapped` v1 payload（R1b 存量成流快照·流起点·payload 仅治理态）。
 *
 * @public
 */
export const organizationBootstrappedPayloadSchema = strictObject({
  status: z.enum(TENANCY_STATUS_WIRE),
  actorId: z.string().optional(),
});
export type OrganizationBootstrappedEventPayload = z.infer<
  typeof organizationBootstrappedPayloadSchema
>;

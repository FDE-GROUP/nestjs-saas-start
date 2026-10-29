/**
 * subscriptions 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 组织订阅切片（读当前订阅快照 + 开通/升级）。旧 `@SerializeOptions` 白名单下沉到 procedure 级
 * `.output`（zod 单源不变）。守卫墙（TenantIsolation+Authorization+@Can）与 provisioning handler
 * 留 apps/api。`successStatus` 数值字面量（201·承 `HttpStatus.CREATED`）。
 */
import { createSubscriptionSchema, subscriptionViewSchema } from '@saas/contracts/index';
import { oc, openapi } from './base';

export const subscriptionsGetCurrentMeta = openapi({
  method: 'GET',
  path: '/subscriptions/current',
  summary: 'Current organization subscription: plan, seat quota, usage, customer mapping',
});
export const subscriptionsCreateMeta = openapi({
  method: 'POST',
  path: '/subscriptions',
  successStatus: 201,
  summary: 'Provision/upgrade the organization subscription (creates the provider customer)',
});

export const subscriptionsGetCurrentContract = oc
  .output(subscriptionViewSchema)
  .meta(subscriptionsGetCurrentMeta);
export const subscriptionsCreateContract = oc
  .input(createSubscriptionSchema)
  .output(subscriptionViewSchema)
  .meta(subscriptionsCreateMeta);

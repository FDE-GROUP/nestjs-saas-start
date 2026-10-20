import { SubscriptionBootstrappedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-bootstrapped.event';
import { SubscriptionCreatedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-created.event';
import { SubscriptionStatusTransitionedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-status-transitioned.event';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/domain/subscription-lifecycle';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';
import {
  SUBSCRIPTION_EVENT_TYPES_WIRE,
  SUBSCRIPTION_STATUS_WIRE,
  subscriptionBootstrappedPayloadSchema,
  subscriptionCreatedPayloadSchema,
  subscriptionStatusTransitionedPayloadSchema,
} from '@saas/contracts';
import { describe, expect, it } from 'vitest';

/**
 * subscription 流事件「zod 契约（@saas/contracts）⇄ 事件类（@core）」对拍测
 * （ES R4 第二上下文推广 · module-es-r4-second-context-subscriptions · 裁⑥甲 · DB-free）。
 *
 * 双向赋值锁先例：类侧产出的 payload 必须过 schema.parse；schema 派生的合法样本必须能进
 * 类构造。事件名/wire enum 两侧一致性在此锁死（contracts 零依赖 @core·内联值漂移即红）。
 */
describe('subscription 流事件契约 ⇄ 事件类 对拍（ES R4 · 裁⑥甲）', () => {
  it('事件名两侧单源一致：DOMAIN_EVENTS（subscription 三键）⇄ SUBSCRIPTION_EVENT_TYPES_WIRE', () => {
    expect(SUBSCRIPTION_EVENT_TYPES_WIRE.statusTransitioned).toBe(
      DOMAIN_EVENTS.subscriptionStatusTransitioned,
    );
    expect(SUBSCRIPTION_EVENT_TYPES_WIRE.created).toBe(DOMAIN_EVENTS.subscriptionCreated);
    expect(SUBSCRIPTION_EVENT_TYPES_WIRE.bootstrapped).toBe(DOMAIN_EVENTS.subscriptionBootstrapped);
  });

  it('治理态 wire enum 值集 ⇄ SUBSCRIPTION_STATUS 单源一致（contracts 内联防漂移）', () => {
    expect([...SUBSCRIPTION_STATUS_WIRE].sort()).toEqual(
      [...Object.values(SUBSCRIPTION_STATUS)].map(String).sort(),
    );
  });

  it('类 EVENT_TYPE/VERSION/AGGREGATE 静态常量 ⇄ 契约事件名', () => {
    expect(SubscriptionStatusTransitionedEvent.EVENT_TYPE).toBe(
      SUBSCRIPTION_EVENT_TYPES_WIRE.statusTransitioned,
    );
    expect(SubscriptionCreatedEvent.EVENT_TYPE).toBe(SUBSCRIPTION_EVENT_TYPES_WIRE.created);
    expect(SubscriptionBootstrappedEvent.EVENT_TYPE).toBe(
      SUBSCRIPTION_EVENT_TYPES_WIRE.bootstrapped,
    );
    for (const EventClass of [
      SubscriptionStatusTransitionedEvent,
      SubscriptionCreatedEvent,
      SubscriptionBootstrappedEvent,
    ]) {
      expect(EventClass.EVENT_VERSION).toBe(1);
      expect(EventClass.AGGREGATE_TYPE).toBe('subscription');
    }
  });

  it('双向赋值锁：类产出 payload 过 schema.parse；合法样本能进类构造', () => {
    const t = new SubscriptionStatusTransitionedEvent({
      aggregateId: 'sub-1',
      payload: { from: 'active', to: 'suspended', actorId: 'u-1' },
    });
    expect(() => subscriptionStatusTransitionedPayloadSchema.parse(t.payload)).not.toThrow();

    const c = new SubscriptionCreatedEvent({
      aggregateId: 'sub-1',
      payload: { plan: 'pro', status: 'active' },
    });
    expect(() => subscriptionCreatedPayloadSchema.parse(c.payload)).not.toThrow();

    const b = new SubscriptionBootstrappedEvent({
      aggregateId: 'sub-1',
      payload: { status: 'expired', plan: 'basic' },
    });
    expect(() => subscriptionBootstrappedPayloadSchema.parse(b.payload)).not.toThrow();

    // 非法枚举被 schema 拒（防旁逸）
    expect(() =>
      subscriptionCreatedPayloadSchema.parse({ plan: 'pro', status: 'ghost' }),
    ).toThrow();
  });
});

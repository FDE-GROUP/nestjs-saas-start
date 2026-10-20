import { describe, expect, it } from 'vitest';
import { SubscriptionBootstrappedEvent } from './events/subscription-bootstrapped.event';
import { SubscriptionCreatedEvent } from './events/subscription-created.event';
import { SubscriptionStatusTransitionedEvent } from './events/subscription-status-transitioned.event';
import { applySubscriptionEvent, replaySubscriptionLifecycle } from './subscription-lifecycle-fold';

/**
 * 订阅治理 fold 单测（ES R4 第二上下文推广 · module-es-r4-second-context-subscriptions · DB-free）。
 * 锁「回放即真相」读侧裁决语义：created/bootstrapped 起点 / 最后快照重启 / from 漂移拒回放 /
 * 非法迁移拒回放 / 起点重复 fail-loud / 未知事件 fail-loud。
 */

function transitioned(
  aggregateId: string,
  from: string | null,
  to: string,
  eventId = aggregateId,
): SubscriptionStatusTransitionedEvent {
  return new SubscriptionStatusTransitionedEvent({
    aggregateId,
    eventId,
    payload: { from: from as never, to: to as never },
  });
}

function created(aggregateId: string, status = 'active', plan = 'pro'): SubscriptionCreatedEvent {
  return new SubscriptionCreatedEvent({
    aggregateId,
    payload: { plan, status: status as never },
  });
}

describe('replaySubscriptionLifecycle（subscription 流回放 fold）', () => {
  it('空流 → undefined（无订阅行=无状态记录）', () => {
    expect(replaySubscriptionLifecycle([])).toBeUndefined();
  });

  it('created 起点 → 建立初态；后续迁移正常续放', () => {
    const events = [
      created('subA', 'active'),
      transitioned('subA', 'active', 'suspended'),
      transitioned('subA', 'suspended', 'active'),
    ];
    const state = replaySubscriptionLifecycle(events);
    expect(state).toMatchObject({ subscriptionId: 'subA', status: 'active' });
    expect(state?.version).toBe(3);
  });

  it('created 起点可携非 active 初态（如建行即 expired）', () => {
    const state = replaySubscriptionLifecycle([created('subB', 'expired')]);
    expect(state).toMatchObject({ subscriptionId: 'subB', status: 'expired', version: 1 });
  });

  it('bootstrapped 最后快照重启：覆盖此前一切（存量 backfill 不重排历史）', () => {
    const events = [
      created('subC', 'active'),
      transitioned('subC', 'active', 'suspended', 'stale'),
      new SubscriptionBootstrappedEvent({ aggregateId: 'subC', payload: { status: 'cancelled' } }),
      transitioned('subC', 'cancelled', 'cancelled', 'noop'),
    ];
    // 末位 bootstrapped 重启起点=cancelled，随后 transitioned cancelled→cancelled 非法（自反）应 fail-loud
    expect(() => replaySubscriptionLifecycle(events)).toThrow(/非法迁移/);
  });

  it('bootstrapped 起点后续合法迁移正常折叠', () => {
    const events = [
      new SubscriptionBootstrappedEvent({ aggregateId: 'subD', payload: { status: 'active' } }),
      transitioned('subD', 'active', 'expired'),
    ];
    const state = replaySubscriptionLifecycle(events);
    expect(state).toMatchObject({ subscriptionId: 'subD', status: 'expired', version: 2 });
  });

  it('from 与重放态漂移 → fail-loud（篡改/分叉防御）', () => {
    const events = [created('subE', 'active'), transitioned('subE', 'suspended', 'active')];
    expect(() => replaySubscriptionLifecycle(events)).toThrow(/漂移/);
  });

  it('非法迁移（终态 expired → active）→ fail-loud', () => {
    const events = [
      created('subF', 'active'),
      transitioned('subF', 'active', 'expired'),
      transitioned('subF', 'expired', 'active'),
    ];
    expect(() => replaySubscriptionLifecycle(events)).toThrow(/非法迁移/);
  });

  it('起点事件出现在已定位流 → fail-loud（created 二次）', () => {
    const events = [created('subG', 'active'), created('subG', 'active')];
    expect(() => replaySubscriptionLifecycle(events)).toThrow(/只允许流起点/);
  });

  it('非 subscription 聚合事件 → fail-loud', () => {
    const foreign = new SubscriptionCreatedEvent({
      aggregateId: 'x',
      payload: { plan: 'p', status: 'active' },
    });
    // 手工改聚合类型模拟异源
    const tampered = Object.assign(Object.create(Object.getPrototypeOf(foreign)), foreign, {
      aggregateType: 'tenant',
    });
    expect(() => applySubscriptionEvent(undefined, tampered)).toThrow(/非 subscription 聚合/);
  });

  it('合法迁移表：suspended → active/cancelled 均可', () => {
    expect(
      replaySubscriptionLifecycle([
        created('subH', 'active'),
        transitioned('subH', 'active', 'suspended'),
        transitioned('subH', 'suspended', 'cancelled'),
      ]),
    ).toMatchObject({ status: 'cancelled' });
  });
});

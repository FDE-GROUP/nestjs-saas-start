import { TenantBootstrappedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-bootstrapped.event';
import { TenantRejectedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-rejected.event';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';
import {
  TENANT_EVENT_TYPES_WIRE,
  TENANT_STATUS_WIRE,
  tenantBootstrappedPayloadSchema,
  tenantRejectedPayloadSchema,
  tenantStatusTransitionedPayloadSchema,
} from '@saas/contracts';
import { describe, expect, it } from 'vitest';

/**
 * tenant 流事件「zod 契约（@saas/contracts）⇄ 事件类（@core）」对拍测
 * （ES R1a · module-es-r1-replay-core §3-R1a · 裁⑥甲 · DB-free）。
 *
 * 双向赋值锁先例：类侧产出的 payload 必须过 schema.parse；schema 派生的合法样本必须能进
 * 类构造。事件名/wire enum 两侧一致性在此锁死（contracts 零依赖 @core·内联值漂移即红）。
 */
describe('tenant 流事件契约 ⇄ 事件类 对拍（ES R1a · 裁⑥甲）', () => {
  it('事件名两侧单源一致：DOMAIN_EVENTS（tenant 三键）⇄ TENANT_EVENT_TYPES_WIRE', () => {
    expect(TENANT_EVENT_TYPES_WIRE.statusTransitioned).toBe(DOMAIN_EVENTS.tenantStatusTransitioned);
    expect(TENANT_EVENT_TYPES_WIRE.rejected).toBe(DOMAIN_EVENTS.tenantRejected);
    expect(TENANT_EVENT_TYPES_WIRE.bootstrapped).toBe(DOMAIN_EVENTS.tenantBootstrapped);
  });

  it('治理态 wire enum 值集 ⇄ TENANT_STATUS 单源一致（contracts 内联防漂移）', () => {
    expect([...TENANT_STATUS_WIRE].sort()).toEqual(
      [...Object.values(TENANT_STATUS)].map(String).sort(),
    );
  });

  it('类 EVENT_TYPE/VERSION/AGGREGATE 静态常量 ⇄ 契约事件名；payload 双向赋值锁', () => {
    expect(TenantStatusTransitionedEvent.EVENT_TYPE).toBe(
      TENANT_EVENT_TYPES_WIRE.statusTransitioned,
    );
    expect(TenantRejectedEvent.EVENT_TYPE).toBe(TENANT_EVENT_TYPES_WIRE.rejected);
    expect(TenantBootstrappedEvent.EVENT_TYPE).toBe(TENANT_EVENT_TYPES_WIRE.bootstrapped);
    for (const Cls of [
      TenantStatusTransitionedEvent,
      TenantRejectedEvent,
      TenantBootstrappedEvent,
    ]) {
      expect(Cls.EVENT_VERSION).toBe(1);
      expect(Cls.AGGREGATE_TYPE).toBe('tenant');
    }

    // 方向一：类实例 payload → schema.parse 通过
    const transitioned = new TenantStatusTransitionedEvent({
      aggregateId: 'orgA',
      payload: { from: null, to: 'active', actorId: 'ops' },
    });
    expect(tenantStatusTransitionedPayloadSchema.parse(transitioned.payload)).toMatchObject({
      from: null,
      to: 'active',
    });
    const rejected = new TenantRejectedEvent({ aggregateId: 'orgA', payload: { actorId: 'ops' } });
    expect(tenantRejectedPayloadSchema.parse(rejected.payload)).toEqual({ actorId: 'ops' });
    const bootstrapped = new TenantBootstrappedEvent({
      aggregateId: 'orgA',
      payload: { status: 'pending_approval', actorId: 'bootstrap' },
    });
    expect(tenantBootstrappedPayloadSchema.parse(bootstrapped.payload)).toMatchObject({
      status: 'pending_approval',
    });

    // 方向二：schema 派生合法样本 → 类构造可用（信封透传保真）
    const sample = tenantStatusTransitionedPayloadSchema.parse({
      from: 'active',
      to: 'suspended',
    });
    const rebuilt = new TenantStatusTransitionedEvent({
      aggregateId: 'orgB',
      eventId: 'fixed-event-id',
      occurredAt: new Date('2026-10-21T00:00:00.000Z'),
      payload: sample,
    });
    expect(rebuilt.eventId).toBe('fixed-event-id');
    expect(rebuilt.eventType).toBe(DOMAIN_EVENTS.tenantStatusTransitioned);
    expect(rebuilt.payload.to).toBe('suspended');
  });

  it('strict 语义：未知键/非法枚举值一律拒（回放载荷不容猜）', () => {
    expect(() =>
      tenantBootstrappedPayloadSchema.parse({ status: 'active', mystery: 1 }),
    ).toThrowError();
    expect(() => tenantBootstrappedPayloadSchema.parse({ status: 'not_a_status' })).toThrowError();
    expect(() =>
      tenantStatusTransitionedPayloadSchema.parse({ from: 'bogus', to: 'active' }),
    ).toThrowError();
  });
});

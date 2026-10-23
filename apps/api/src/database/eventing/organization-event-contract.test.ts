import { OrganizationBootstrappedEvent } from '@core/saas-kit/modules/organizations/lifecycle/events/organization-bootstrapped.event';
import { OrganizationRejectedEvent } from '@core/saas-kit/modules/organizations/lifecycle/events/organization-rejected.event';
import { OrganizationStatusTransitionedEvent } from '@core/saas-kit/modules/organizations/lifecycle/events/organization-status-transitioned.event';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';
import {
  ORGANIZATION_EVENT_TYPES_WIRE,
  ORGANIZATION_STATUS_WIRE,
  organizationBootstrappedPayloadSchema,
  organizationRejectedPayloadSchema,
  organizationStatusTransitionedPayloadSchema,
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
  it('事件名两侧单源一致：DOMAIN_EVENTS（organization 三键）⇄ ORGANIZATION_EVENT_TYPES_WIRE', () => {
    expect(ORGANIZATION_EVENT_TYPES_WIRE.statusTransitioned).toBe(
      DOMAIN_EVENTS.organizationStatusTransitioned,
    );
    expect(ORGANIZATION_EVENT_TYPES_WIRE.rejected).toBe(DOMAIN_EVENTS.organizationRejected);
    expect(ORGANIZATION_EVENT_TYPES_WIRE.bootstrapped).toBe(DOMAIN_EVENTS.organizationBootstrapped);
  });

  it('治理态 wire enum 值集 ⇄ ORGANIZATION_STATUS 单源一致（contracts 内联防漂移）', () => {
    expect([...ORGANIZATION_STATUS_WIRE].sort()).toEqual(
      [...Object.values(ORGANIZATION_STATUS)].map(String).sort(),
    );
  });

  it('类 EVENT_TYPE/VERSION/AGGREGATE 静态常量 ⇄ 契约事件名；payload 双向赋值锁', () => {
    expect(OrganizationStatusTransitionedEvent.EVENT_TYPE).toBe(
      ORGANIZATION_EVENT_TYPES_WIRE.statusTransitioned,
    );
    expect(OrganizationRejectedEvent.EVENT_TYPE).toBe(ORGANIZATION_EVENT_TYPES_WIRE.rejected);
    expect(OrganizationBootstrappedEvent.EVENT_TYPE).toBe(
      ORGANIZATION_EVENT_TYPES_WIRE.bootstrapped,
    );
    for (const Cls of [
      OrganizationStatusTransitionedEvent,
      OrganizationRejectedEvent,
      OrganizationBootstrappedEvent,
    ]) {
      expect(Cls.EVENT_VERSION).toBe(1);
      expect(Cls.AGGREGATE_TYPE).toBe('tenant');
    }

    // 方向一：类实例 payload → schema.parse 通过
    const transitioned = new OrganizationStatusTransitionedEvent({
      aggregateId: 'orgA',
      payload: { from: null, to: 'active', actorId: 'ops' },
    });
    expect(organizationStatusTransitionedPayloadSchema.parse(transitioned.payload)).toMatchObject({
      from: null,
      to: 'active',
    });
    const rejected = new OrganizationRejectedEvent({
      aggregateId: 'orgA',
      payload: { actorId: 'ops' },
    });
    expect(organizationRejectedPayloadSchema.parse(rejected.payload)).toEqual({ actorId: 'ops' });
    const bootstrapped = new OrganizationBootstrappedEvent({
      aggregateId: 'orgA',
      payload: { status: 'pending_approval', actorId: 'bootstrap' },
    });
    expect(organizationBootstrappedPayloadSchema.parse(bootstrapped.payload)).toMatchObject({
      status: 'pending_approval',
    });

    // 方向二：schema 派生合法样本 → 类构造可用（信封透传保真）
    const sample = organizationStatusTransitionedPayloadSchema.parse({
      from: 'active',
      to: 'suspended',
    });
    const rebuilt = new OrganizationStatusTransitionedEvent({
      aggregateId: 'orgB',
      eventId: 'fixed-event-id',
      occurredAt: new Date('2026-10-21T00:00:00.000Z'),
      payload: sample,
    });
    expect(rebuilt.eventId).toBe('fixed-event-id');
    expect(rebuilt.eventType).toBe(DOMAIN_EVENTS.organizationStatusTransitioned);
    expect(rebuilt.payload.to).toBe('suspended');
  });

  it('strict 语义：未知键/非法枚举值一律拒（回放载荷不容猜）', () => {
    expect(() =>
      organizationBootstrappedPayloadSchema.parse({ status: 'active', mystery: 1 }),
    ).toThrowError();
    expect(() =>
      organizationBootstrappedPayloadSchema.parse({ status: 'not_a_status' }),
    ).toThrowError();
    expect(() =>
      organizationStatusTransitionedPayloadSchema.parse({ from: 'bogus', to: 'active' }),
    ).toThrowError();
  });
});

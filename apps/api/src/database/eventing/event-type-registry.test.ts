import { TenantRejectedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-rejected.event';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { UserStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/user-status-transitioned.event';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';
import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_REGISTRY } from './event-type-registry';
import { OutboxRelay } from './outbox-relay';

/**
 * `EVENT_TYPE_REGISTRY` 契约测试（module-es-outbox-transactional 切片 C·设计参考五点之②：
 * 事件名集中常量 + 契约测试**双向锁**）——新事件漏登记 / 常量与类漂移 = 本测红，
 * 杜绝 relay 运行期才炸。
 */
describe('EVENT_TYPE_REGISTRY ↔ DOMAIN_EVENTS ↔ 事件类 双向锁', () => {
  it('registry keys 与 DOMAIN_EVENTS 值集双向相等（不多不少）', () => {
    expect([...EVENT_TYPE_REGISTRY.keys()].sort()).toEqual(
      [...Object.values(DOMAIN_EVENTS)].sort(),
    );
  });

  it('每个注册项：类 EVENT_TYPE 与键一致，且版本不超 relay 支持上限', () => {
    for (const [eventType, EventClass] of EVENT_TYPE_REGISTRY) {
      expect(EventClass.EVENT_TYPE).toBe(eventType);
      expect((EventClass as { EVENT_VERSION?: number }).EVENT_VERSION ?? 1).toBeLessThanOrEqual(
        OutboxRelay.SUPPORTED_EVENT_VERSION,
      );
    }
  });

  it('重建契约：信封显式值逐字段透传（不重掷 eventId·不重取 occurredAt——审计按原始时点复原）', () => {
    const classes = [
      UserStatusTransitionedEvent,
      TenantStatusTransitionedEvent,
      TenantRejectedEvent,
    ] as const;
    for (const EventClass of classes) {
      const rowEventId = 'row-evt-1';
      const rowOccurredAt = new Date('2026-01-01T00:00:00.000Z');
      const instance = new EventClass({
        eventId: rowEventId,
        aggregateId: 'agg-1',
        eventVersion: 1,
        occurredAt: rowOccurredAt,
        correlationId: 'corr-1',
        // 四类 payload 各异，本测只锁信封透传·payload 内容非契约面
        payload: {} as any,
      });
      expect(instance.eventId).toBe(rowEventId);
      expect(instance.occurredAt).toBe(rowOccurredAt);
      expect(instance.correlationId).toBe('corr-1');
      expect(instance.eventType).toBe(EventClass.EVENT_TYPE);
      // registry 必须收录该类（类与表同源核对）
      expect(EVENT_TYPE_REGISTRY.get(EventClass.EVENT_TYPE)).toBe(EventClass);
    }
  });
});

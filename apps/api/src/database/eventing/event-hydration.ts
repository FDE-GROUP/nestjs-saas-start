import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { EVENT_TYPE_REGISTRY } from './event-type-registry';

/**
 * 事件行 → `DomainEvent` 实例重建单源（ES R1b · module-es-r1-replay-core）。
 *
 * 抽自 `MikroEventStore.load`（R1a）——同一段「注册表反序列化 + 信封显式值透传」契约
 * 现由两消费方共用：生产读侧（`EVENT_STORE` load）与 R1b bootstrap 脚本的 `--verify`
 * 对拍面（脚本经 tsx 直连 Mikro，不经 Nest 服务图，故不可 import `MikroEventStore`）。
 * 语义单源防双写漂移：**未知 eventType fail-loud 拒回放；eventId/occurredAt/correlationId
 * 透传不重掷**（同 relay 重建契约·锁于 event-store gated e2e）。
 */
export interface EventRowShape {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: unknown;
  readonly occurredAt: Date;
  readonly metadata?: unknown;
}

/** 单行重建；注册表外 eventType fail-loud（不可信流不猜）。 */
export function hydrateEventRow(row: EventRowShape): DomainEvent {
  const EventClass = EVENT_TYPE_REGISTRY.get(row.eventType);
  if (!EventClass) {
    throw new Error(
      `EVENT_STORE load: 未知 eventType ${row.eventType}（event ${row.eventId}）——注册表外事件，拒回放`,
    );
  }
  const metadata = (row.metadata ?? {}) as {
    correlationId?: string | null;
    causationId?: string | null;
  };
  return new EventClass({
    aggregateId: row.aggregateId,
    payload: row.payload,
    eventId: row.eventId,
    eventVersion: row.eventVersion,
    occurredAt: row.occurredAt,
    correlationId: metadata.correlationId ?? undefined,
    causationId: metadata.causationId ?? undefined,
  });
}

/** 批量重建（调用方保证已按 version 升序）。 */
export function hydrateEventRows(rows: readonly EventRowShape[]): DomainEvent[] {
  return rows.map((row) => hydrateEventRow(row));
}

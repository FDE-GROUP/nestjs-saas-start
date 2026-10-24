import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';
import type { SubscriptionStatus } from '../subscription-lifecycle';

/**
 * 订阅创建事件载荷（实时创建的流起点）。
 *
 * @public
 */
export interface SubscriptionCreatedPayload {
  /** 订阅计划标识（非 PII·opaque 计划码）。 */
  readonly plan: string;
  /** 建行即流起点态（现有默认 active）。 */
  readonly status: SubscriptionStatus;
  /** 创建动作主体（opaque id·PII 最小化：仅 id 不携邮箱）。 */
  readonly actorId?: string;
}

/**
 * 新建 `organization_subscription` 行时产出的事件（ES R4 第二上下文推广·实时流起点）。
 *
 * @remarks
 * Raised when a new `organization_subscription` row is created（ES R4 第二上下文推广 ·
 * module-es-r4-second-context-subscriptions 裁ⓒ/裁ⓔ·全覆盖纳入真相源）。
 * eventType `subscription.created`, eventVersion 1, aggregateType `subscription`。
 *
 * 语义：**实时创建的流起点**——fold 见此事件即以 `status` 建立初始态（要求空态出现·
 * 再见=流损坏 fail-loud）。与 R4b 存量成流的 `subscription.bootstrapped` 分工：created 为
 * 上线后新行、bootstrapped 为历史存量快照；两者都是流内起点。aggregateId=订阅行 id（裁ⓐ甲）。
 *
 * @public
 */
export class SubscriptionCreatedEvent extends DomainEvent<SubscriptionCreatedPayload> {
  /** 该事件类型常量（稳定契约名）。 */
  static readonly EVENT_TYPE = DOMAIN_EVENTS.subscriptionCreated;
  /** 该事件 schema 版本号。 */
  static readonly EVENT_VERSION = 1;
  /** 该事件聚合类型常量（供订阅/投影路由）。 */
  static readonly AGGREGATE_TYPE = 'subscription';

  constructor(
    props: Omit<DomainEventProps<SubscriptionCreatedPayload>, 'eventType' | 'aggregateType'>,
  ) {
    super({
      ...props,
      aggregateType: SubscriptionCreatedEvent.AGGREGATE_TYPE,
      eventType: SubscriptionCreatedEvent.EVENT_TYPE,
      eventVersion: SubscriptionCreatedEvent.EVENT_VERSION,
    });
  }
}

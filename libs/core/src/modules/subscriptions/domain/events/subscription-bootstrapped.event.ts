import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';
import type { SubscriptionStatus } from '../subscription-lifecycle';

/**
 * 订阅 bootstrap 事件载荷（存量流起点快照）。
 *
 * @public
 */
export interface SubscriptionBootstrappedPayload {
  /** 存量行成流时刻的治理态快照（`organization_subscription.status` 真列原值）。 */
  readonly status: SubscriptionStatus;
  /** 计划标识（存量快照携带·可空以容历史缺列）。 */
  readonly plan?: string;
  /** bootstrap 动作主体（运维脚本恒 `bootstrap`·审计留痕）。 */
  readonly actorId?: string;
}

/**
 * R4b bootstrap 脚本为每条存量 `organization_subscription` 行产出的事件（ES R4 第二上下文推广）。
 *
 * @remarks
 * Raised by the R4b bootstrap script for each pre-existing `organization_subscription` row
 * （ES R4 第二上下文推广 · module-es-r4-second-context-subscriptions·裁ⓒ·沿 tenants bootstrapped 律）。
 * eventType `subscription.bootstrapped`, eventVersion 1, aggregateType `subscription`。
 *
 * 语义：**存量流起点快照**——全流回放采「最后快照重启」（覆盖此前一切·不重排历史·同 tenants R1b）；
 * version 从流现有 max+1 续位·幂等律=流内已含本事件则跳过。aggregateId=订阅行 id（裁ⓐ甲）。
 *
 * PII 边界：payload 仅治理态 + opaque 计划码·无 subject PII（表列=id/organizationId/plan/status/limits/period/provider refs）。
 *
 * @public
 */
export class SubscriptionBootstrappedEvent extends DomainEvent<SubscriptionBootstrappedPayload> {
  static readonly EVENT_TYPE = DOMAIN_EVENTS.subscriptionBootstrapped;
  static readonly EVENT_VERSION = 1;
  static readonly AGGREGATE_TYPE = 'subscription';

  constructor(
    props: Omit<DomainEventProps<SubscriptionBootstrappedPayload>, 'eventType' | 'aggregateType'>,
  ) {
    super({
      ...props,
      aggregateType: SubscriptionBootstrappedEvent.AGGREGATE_TYPE,
      eventType: SubscriptionBootstrappedEvent.EVENT_TYPE,
      eventVersion: SubscriptionBootstrappedEvent.EVENT_VERSION,
    });
  }
}

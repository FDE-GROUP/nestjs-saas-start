import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';
import type { SubscriptionStatus } from '../subscription-lifecycle';

export interface SubscriptionStatusTransitionedPayload {
  /** 迁移前态；空流起点为 null（与 tenants 同口径）。 */
  readonly from: SubscriptionStatus | null;
  readonly to: SubscriptionStatus;
  /** 治理动作主体（opaque id·PII 最小化）。 */
  readonly actorId?: string;
  readonly reason?: string;
}

/**
 * Raised when a subscription transitions along the governance state machine
 * (active/suspended/expired/cancelled·ES R4·由 `convergeStatus` 触发·租户治理联动或直操)。
 * eventType `subscription.status.transitioned`, eventVersion 1, aggregateType `subscription`。
 */
export class SubscriptionStatusTransitionedEvent extends DomainEvent<SubscriptionStatusTransitionedPayload> {
  static readonly EVENT_TYPE = DOMAIN_EVENTS.subscriptionStatusTransitioned;
  static readonly EVENT_VERSION = 1;
  static readonly AGGREGATE_TYPE = 'subscription';

  constructor(
    props: Omit<
      DomainEventProps<SubscriptionStatusTransitionedPayload>,
      'eventType' | 'aggregateType'
    >,
  ) {
    super({
      ...props,
      aggregateType: SubscriptionStatusTransitionedEvent.AGGREGATE_TYPE,
      eventType: SubscriptionStatusTransitionedEvent.EVENT_TYPE,
      eventVersion: SubscriptionStatusTransitionedEvent.EVENT_VERSION,
    });
  }
}

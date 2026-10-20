import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';
import type { TenantStatus } from '../tenant-lifecycle';

export interface TenantStatusTransitionedPayload {
  /** 迁移前状态；从未记录状态的行为 null（与 transition 返回的 previous===undefined 同口径）。 */
  readonly from: TenantStatus | null;
  readonly to: TenantStatus;
  /** 治理动作主体（会话用户 id·PII 最小化：仅 id 不携邮箱·§6-③）。 */
  readonly actorId?: string;
  readonly reason?: string;
}

/**
 * Raised when a tenant transitions along the §9.4 lifecycle state machine
 * (approve / suspend / resume / delete 平台级动作，reject 不在内·§6-①)。
 * eventType `tenant.status.transitioned`, eventVersion 1, aggregateType `tenant`。
 * 由 `TenantStatusService.transition` 成功分支产出（shadow append·`tenant.status` 真列仍是唯一真相源）。
 */
export class TenantStatusTransitionedEvent extends DomainEvent<TenantStatusTransitionedPayload> {
  static readonly EVENT_TYPE = DOMAIN_EVENTS.tenantStatusTransitioned;
  static readonly EVENT_VERSION = 1;
  static readonly AGGREGATE_TYPE = 'tenant';

  constructor(
    props: Omit<DomainEventProps<TenantStatusTransitionedPayload>, 'eventType' | 'aggregateType'>,
  ) {
    super({
      ...props,
      aggregateType: TenantStatusTransitionedEvent.AGGREGATE_TYPE,
      eventType: TenantStatusTransitionedEvent.EVENT_TYPE,
      eventVersion: TenantStatusTransitionedEvent.EVENT_VERSION,
    });
  }
}

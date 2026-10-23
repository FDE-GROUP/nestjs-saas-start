import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';
import type { UserStatus } from '../user-status.service';

export interface UserStatusTransitionedPayload {
  /** 迁移前状态；无 user_status 记录行（常见态）为 null（与 previous===undefined 同口径）。 */
  readonly from: UserStatus | null;
  readonly to: UserStatus;
  /** 治理动作主体（会话用户 id·PII 最小化：仅 id 不携邮箱）。 */
  readonly actorId?: string;
  readonly reason?: string;
}

/**
 * Raised when a platform user transitions along the §9.4 lifecycle state machine
 * (suspend / resume 平台级动作)。
 * eventType `user.status.transitioned`, eventVersion 1。
 * aggregateType 刻意取 `user`——与 `user.registered` **同聚合流**（version 连续递增·
 * PIPL deleteByAggregate('user', id) 零额外代码覆盖本事件流，module-tenancy-es-user-status-events §1）。
 */
export class UserStatusTransitionedEvent extends DomainEvent<UserStatusTransitionedPayload> {
  static readonly EVENT_TYPE = DOMAIN_EVENTS.userStatusTransitioned;
  static readonly EVENT_VERSION = 1;
  static readonly AGGREGATE_TYPE = 'user';

  constructor(
    props: Omit<DomainEventProps<UserStatusTransitionedPayload>, 'eventType' | 'aggregateType'>,
  ) {
    super({
      ...props,
      aggregateType: UserStatusTransitionedEvent.AGGREGATE_TYPE,
      eventType: UserStatusTransitionedEvent.EVENT_TYPE,
      eventVersion: UserStatusTransitionedEvent.EVENT_VERSION,
    });
  }
}

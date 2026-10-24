import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';
import type { OrganizationStatus } from '../organization-lifecycle';

/**
 * 租户状态迁移事件载荷（迁移端点 + 治理主体/理由）。
 *
 * @public
 */
export interface OrganizationStatusTransitionedPayload {
  /** 迁移前状态；从未记录状态的行为 null（与 transition 返回的 previous===undefined 同口径）。 */
  readonly from: OrganizationStatus | null;
  /** 迁移后的目标状态。 */
  readonly to: OrganizationStatus;
  /** 治理动作主体（会话用户 id·PII 最小化：仅 id 不携邮箱·§6-③）。 */
  readonly actorId?: string;
  /** 原因/备注文本。 */
  readonly reason?: string;
}

/**
 * 租户沿 §9.4 生命周期状态机迁移时产出的事件（approve / suspend / resume / delete 平台级动作）。
 *
 * @remarks
 * Raised when a tenant transitions along the §9.4 lifecycle state machine
 * (approve / suspend / resume / delete 平台级动作，reject 不在内·§6-①)。
 * eventType `tenant.status.transitioned`, eventVersion 1, aggregateType `tenant`。
 * 由 `OrganizationStatusService.transition` 成功分支产出（shadow append·`organization.status` 真列仍是唯一真相源）。
 *
 * @public
 */
export class OrganizationStatusTransitionedEvent extends DomainEvent<OrganizationStatusTransitionedPayload> {
  /** 该事件类型常量（稳定契约名）。 */
  static readonly EVENT_TYPE = DOMAIN_EVENTS.organizationStatusTransitioned;
  /** 该事件 schema 版本号。 */
  static readonly EVENT_VERSION = 1;
  /** 该事件聚合类型常量（供订阅/投影路由）。 */
  static readonly AGGREGATE_TYPE = 'tenant';

  constructor(
    props: Omit<
      DomainEventProps<OrganizationStatusTransitionedPayload>,
      'eventType' | 'aggregateType'
    >,
  ) {
    super({
      ...props,
      aggregateType: OrganizationStatusTransitionedEvent.AGGREGATE_TYPE,
      eventType: OrganizationStatusTransitionedEvent.EVENT_TYPE,
      eventVersion: OrganizationStatusTransitionedEvent.EVENT_VERSION,
    });
  }
}

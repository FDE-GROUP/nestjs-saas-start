import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';

/**
 * 租户驳回事件载荷（仅证明「何人何时驳回何 orgId」）。
 *
 * @public
 */
export interface OrganizationRejectedPayload {
  /** 驳回动作主体（会话用户 id）。 */
  readonly actorId?: string;
  /** 预留向后兼容位：当前 RejectOrganizationCommand 无 reason 字段，本切片恒不填（plan §3）。 */
  readonly reason?: string;
}

/**
 * 平台经营者驳回 pending 租户申请（reject 硬删路径成功）时产出的事件。
 *
 * @remarks
 * Raised when a platform operator rejects a pending tenant application
 * (reject 硬删路径成功)。eventType `tenant.rejected`, eventVersion 1。
 *
 * 驳回是「删除事实」而非状态迁移，故独立事件名、不复用 transitioned。
 * org 行被物理删除后，本事件是该租户「存在过并被驳回」的唯一耐久痕迹
 *（影子追加体系里「行没了、事件还在」的入口，plan §1）。
 * PII 边界：payload 只证明「何人何时驳回何 orgId」，不携 name/slug——
 * 驳回即应抹掉申请内容。aggregateType 取 `tenant` 与 tenant.transitioned 同流。
 *
 * @public
 */
export class OrganizationRejectedEvent extends DomainEvent<OrganizationRejectedPayload> {
  /** 该事件类型常量（稳定契约名）。 */
  static readonly EVENT_TYPE = DOMAIN_EVENTS.organizationRejected;
  /** 该事件 schema 版本号。 */
  static readonly EVENT_VERSION = 1;
  /** 该事件聚合类型常量（供订阅/投影路由）。 */
  static readonly AGGREGATE_TYPE = 'tenant';

  constructor(
    props: Omit<DomainEventProps<OrganizationRejectedPayload>, 'eventType' | 'aggregateType'>,
  ) {
    super({
      ...props,
      aggregateType: OrganizationRejectedEvent.AGGREGATE_TYPE,
      eventType: OrganizationRejectedEvent.EVENT_TYPE,
      eventVersion: OrganizationRejectedEvent.EVENT_VERSION,
    });
  }
}

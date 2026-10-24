import { DomainEvent, type DomainEventProps } from '../../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../../shared-kernel/domain/domain-event-names';
import type { OrganizationStatus } from '../organization-lifecycle';

/**
 * 租户 bootstrap 事件载荷（流起点快照）。
 *
 * @public
 */
export interface OrganizationBootstrappedPayload {
  /** 存量行成流时刻的治理态快照（当时 `tenant` 户籍表 `status` 真列原值·该旁表已随 consolidation 切片 B DROP）。 */
  readonly status: OrganizationStatus;
  /** bootstrap 动作主体（运维脚本恒 `bootstrap`·审计留痕）。 */
  readonly actorId?: string;
}

/**
 * R1b bootstrap 脚本为每条存量 `tenant` 行产出的事件（ES R1 首试点）。
 *
 * @remarks
 * Raised by the R1b bootstrap script for each pre-existing `tenant` row（ES R1 首试点 ·
 * module-es-r1-replay-core §3-R1b/R1b·裁②甲）。eventType `tenant.bootstrapped`，
 * eventVersion 1，aggregateType `tenant`。
 *
 * 语义：**流起点快照**——fold 见此事件即以其 `status` 覆盖此前一切（存量行不虚构历史迁移，
 * 避免 version 重排）。version 从流现有 max+1 续位（既有治理事件之后），幂等律 = 流内已含
 * 本事件则跳过（可安全重跑）。
 *
 * PII 边界：payload 仅 `status`（成流时户籍表列实存 = id/status/createdAt/updatedAt·无 name/slug，
 * R1a 实核订正 plan 原表述；旁表现已 DROP，本语义为历史快照描述）。id 即 aggregateId，不重复携带。
 *
 * @public
 */
export class OrganizationBootstrappedEvent extends DomainEvent<OrganizationBootstrappedPayload> {
  static readonly EVENT_TYPE = DOMAIN_EVENTS.organizationBootstrapped;
  static readonly EVENT_VERSION = 1;
  static readonly AGGREGATE_TYPE = 'tenant';

  constructor(
    props: Omit<DomainEventProps<OrganizationBootstrappedPayload>, 'eventType' | 'aggregateType'>,
  ) {
    super({
      ...props,
      aggregateType: OrganizationBootstrappedEvent.AGGREGATE_TYPE,
      eventType: OrganizationBootstrappedEvent.EVENT_TYPE,
      eventVersion: OrganizationBootstrappedEvent.EVENT_VERSION,
    });
  }
}

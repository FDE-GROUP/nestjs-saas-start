import { Inject, Injectable } from '@nestjs/common';
import { currentRequestId } from '../../../shared-kernel/context/request-context';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../../shared-kernel/domain/event-publisher.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared-kernel/domain/unit-of-work.port';
import { OrganizationStatusTransitionedEvent } from './events/organization-status-transitioned.event';
import { canTransition, isTenantBlocked, type TenantStatus } from './organization-lifecycle';
import { TENANT_STATUS_STORE, type TenantStatusStore } from './tenant-status.store';

/**
 * 租户治理迁移结果结合：ok 携 previous 供审计；
 * not-found/illegal 由调用方转 404/409。
 * @public
 */
export type TenantTransitionResult =
  | { kind: 'ok'; previous: TenantStatus | undefined; status: TenantStatus }
  | { kind: 'not-found' }
  | { kind: 'illegal'; from: TenantStatus | undefined; to: TenantStatus };

/**
 * 迁移可选上下文（§6-③）：治理动作主体与理由，进事件 payload，不落存储新键。
 * @public
 */
export interface TenantTransitionOptions {
  /** 触发迁移的操作者 id（审计用）。 */
  readonly actorId?: string;
  /** 迁移原因（审计/事件）。 */
  readonly reason?: string;
}

/**
 * 租户生命周期状态读写唯一卡点（global-tenant-organization-rehierarchy 切片 E-F 治理换轴·FR-1）。
 *
 * @remarks
 * 复裁定：治理准入态上移归位 `tenant.status`（本服务经 `TenantStatusService` 是**唯一**读写卡点，
 * 禁散点手搓对象）。合法迁移成功后经 `DOMAIN_EVENT_PUBLISHER` 产出
 * `OrganizationStatusTransitionedEvent`（其 `eventType=tenant.status.transitioned`/
 * `aggregateType=tenant` 早已按租户命名·aggregateId=tenantId·消费侧 Odoo saga + 订阅联动据此驱动）。
 * 关键段（写回 + 发布）包入 `UNIT_OF_WORK`（outbox 下域行与事件行同事务原子）。not-found/illegal 零分支绝不发事件。
 *
 * `organization.status` 经片二 K1 语义收口为组织自有轻量态（`canUseOdoo` 读·无独立读写服务），治理
 * 生命周期权威态走本服务（`TenantStatusService`），两不相混。
 * @public
 */
@Injectable()
export class TenantStatusService {
  constructor(
    @Inject(TENANT_STATUS_STORE) private readonly store: TenantStatusStore,
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /**
   * 读取租户当前治理态；本体行无记录 → undefined（deny-list 语义·视同 active）。
   * @param tenantId - 目标租户 id。
   * @returns 当前状态；无记录返回 `undefined`。
   */
  async read(tenantId: string): Promise<TenantStatus | undefined> {
    return this.store.readStatus(tenantId);
  }

  /**
   * 是否生效（FR-1/NFR-1 fail-closed：仅显式 active 为真）。
   * @param tenantId - 目标租户 id。
   * @returns 显式 active 返回 `true`；否则 `false`。
   */
  async isActive(tenantId: string): Promise<boolean> {
    return (await this.read(tenantId)) === 'active';
  }

  /**
   * 是否被拦（中间件失能卡点·deny-list）：无状态记录视同不拦。
   * @param tenantId - 目标租户 id。
   * @returns 命中失能态返回 `true`；否则 `false`。
   */
  async isBlocked(tenantId: string): Promise<boolean> {
    return isTenantBlocked(await this.store.readStatus(tenantId));
  }

  /**
   * 严格状态迁移：按 §9.4 迁移表裁决合法边，非法 → illegal（调用方转 409）。
   *
   * @remarks
   * 本体行不存在 → not-found（转 404·判据是 `tenantExists`）；合法则把准入态归位、写回 `tenant.status` 真列并返回
   * previous 供审计。平台级动作专用（approve/suspend/resume/delete），权限裁决归 PlatformOperatorGuard。
   *
   * @param tenantId - 目标租户 id。
   * @param to - 目标状态。
   * @param options - 可选治理上下文（主体/理由）。
   * @returns 迁移结果结合（ok/not-found/illegal）。
   */
  async transition(
    tenantId: string,
    to: TenantStatus,
    options?: TenantTransitionOptions,
  ): Promise<TenantTransitionResult> {
    return this.uow.run(async () => {
      if (!(await this.store.tenantExists(tenantId))) {
        return { kind: 'not-found' } as const;
      }
      const previous = await this.store.readStatus(tenantId);
      if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to } as const;
      await this.store.upsert(tenantId, to);
      await this.events.publishAll([
        new OrganizationStatusTransitionedEvent({
          aggregateId: tenantId,
          correlationId: currentRequestId(),
          payload: {
            from: previous ?? null,
            to,
            actorId: options?.actorId,
            reason: options?.reason,
          },
        }),
      ]);
      return { kind: 'ok', previous, status: to } as const;
    });
  }
}

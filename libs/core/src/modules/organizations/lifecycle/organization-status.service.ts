import { Inject, Injectable } from '@nestjs/common';
import { currentRequestId } from '../../../shared-kernel/context/request-context';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../../shared-kernel/domain/event-publisher.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared-kernel/domain/unit-of-work.port';
import { OrganizationStatusTransitionedEvent } from './events/organization-status-transitioned.event';
import {
  canTransition,
  isOrganizationBlocked,
  type OrganizationStatus,
} from './organization-lifecycle';
import {
  ORGANIZATION_STATUS_STORE,
  type OrganizationStatusStore,
} from './organization-status.store';

/**
 * 严格迁移结果结合（S5）：ok 携 previous 供审计；not-found/illegal 由调用方转 404/409。
 *
 * @public
 */
export type OrganizationTransitionResult =
  | { kind: 'ok'; previous: OrganizationStatus | undefined; status: OrganizationStatus }
  | { kind: 'not-found' }
  | { kind: 'illegal'; from: OrganizationStatus | undefined; to: OrganizationStatus };

/**
 * 迁移可选上下文（§6-③）：治理动作主体与理由，进事件 payload，不落存储新键。
 *
 * @public
 */
export interface OrganizationTransitionOptions {
  /** 触发迁移的操作者 id（审计用）。 */
  readonly actorId?: string;
  /** 原因/备注文本。 */
  readonly reason?: string;
}

/**
 * 租户状态读写唯一卡点（S4 · FR-1）：经 `OrganizationStatusStore` 端口读写 `organization.status` 真列。
 *
 * @remarks
 * （global-governance-lifecycle-consolidation 切片 B：态从自有 `tenant` 旁表归位 organization 真列·旁表 DROP）。
 * 读侧 fail-closed：本体不存在/非法状态一律非 active；本体行不存在时视同「无状态记录」（deny-list 不拦）。
 * ES 第二切片：合法迁移成功后经 `DOMAIN_EVENT_PUBLISHER` 产出
 * `tenant.status.transitioned`（EDA 跨上下文·订阅联动消费者；治理面已撤「回放即真相」·仅保留事件发布）。
 *
 * @public
 */
@Injectable()
export class OrganizationStatusService {
  constructor(
    @Inject(ORGANIZATION_STATUS_STORE) private readonly store: OrganizationStatusStore,
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    // ES Phase B 后半（module-es-outbox-transactional 切片 B）：ambient UoW，装配见
    // MikroOrmModule @Global·单测直 new 传 pass-through 假实现
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /**
   * 读取租户当前生命周期状态；本体行无记录 → undefined（deny-list 语义·视同 active）。
   *
   * @param organizationId - 目标租户 id
   * @returns 当前状态；无记录返回 `undefined`
   */
  async read(organizationId: string): Promise<OrganizationStatus | undefined> {
    return this.store.readStatus(organizationId);
  }

  /**
   * 是否生效（FR-1/NFR-1 fail-closed：仅显式 active 为真）。
   *
   * @param organizationId - 目标租户 id
   * @returns 显式 active 返回 `true`；否则 `false`
   */
  async isActive(organizationId: string): Promise<boolean> {
    return (await this.read(organizationId)) === 'active';
  }

  /**
   * 是否被拦（S4 中间件失能卡点·deny-list）：无状态记录视同不拦。
   *
   * @remarks
   * fail-open 仅限「无状态记录」边界，与 fail-closed 隔离不矛盾——本体无行则下游租户解析早已 fail。
   *
   * @param organizationId - 目标租户 id
   * @returns 命中失能态返回 `true`；否则 `false`
   */
  async isBlocked(organizationId: string): Promise<boolean> {
    return isOrganizationBlocked(await this.store.readStatus(organizationId));
  }

  /**
   * 严格状态迁移（S5 收紧）：按 §9.4 迁移表裁决合法边，非法 → illegal（调用方转 409）。
   *
   * @remarks
   * 本体行不存在 → not-found（转 404·判据是 `organizationExists`）；合法则
   * 写回 `organization.status` 真列（consolidation 切片 B 归位·原 `tenant` 户籍行 upsert 已退场）并返回 previous 供审计。平台级动作专用（approve/suspend/resume/delete），
   * 权限裁决归 PlatformOperatorGuard。
   * ES Phase B 后半（module-es-outbox-transactional 切片 B）：关键段（写回 + 发布）包入
   * `UNIT_OF_WORK`——outbox 下域行与事件行同事务原子；shadow 下发布/append 失败连带业务写
   * 回滚（语义较旧「非事务窗口」收紧·plan §2.1）；inproc 下事务空转语义等价。
   * not-found/illegal 零分支绝不发事件。
   *
   * @param organizationId - 目标租户 id
   * @param to - 目标状态
   * @param options - 可选治理上下文（主体/理由）
   * @returns 迁移结果结合（ok/not-found/illegal）
   */
  async transition(
    organizationId: string,
    to: OrganizationStatus,
    options?: OrganizationTransitionOptions,
  ): Promise<OrganizationTransitionResult> {
    return this.uow.run(async () => {
      if (!(await this.store.organizationExists(organizationId))) {
        return { kind: 'not-found' } as const;
      }

      // 前置态取自 `organization.status` 真列（global-governance-lifecycle-consolidation 切片 B·
      // 治理面撤「回放即真相」·原 ES R1c fold 覆盖层随切片 D 退役）。
      const previous = await this.store.readStatus(organizationId);
      if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to } as const;
      await this.store.upsert(organizationId, to);
      // 保留 EDA 领域事件发布（跨上下文 subscriptions 联动消费者·「撤回放即真相」≠「撤领域事件」）。
      await this.events.publishAll([
        new OrganizationStatusTransitionedEvent({
          aggregateId: organizationId,
          // 关联 id 统一链（FR-4）：治理动作均在 HTTP 请求内，后台调用允许 undefined。
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

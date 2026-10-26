// S9 铁律：EVENT_STORE 为 Symbol token 必须值导入；EventStore 纯类型面可 import type

import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { EVENT_STORE, type EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { TenantHardDeleteResult } from '../../read-models/tenant-governance.read-model';
import { DeleteOrganizationPermanentlyCommand } from '../delete-organization-permanently.command';

/**
 * 硬删租户 handler（NFR-6 删除半·FR-6·平台级）：前置闸仅 `tenant.status=deleted` 终态可消灭，
 * 先补删事件后连带清除该租户名下所有组织 + 租户本体。
 *
 * @remarks
 * 治理台改锚 tenant（rehierarchy 片一）：作用对象从单组织升为**租户**——`findTenantDetail` 一次取准入态（前置闸）
 * 与名下组织名册（事件双维补删：`tenant` 聚合下 tenantId + 每 orgId·沿假设④）。前置闸（甲裁·两段式
 * 先软后硬，误删 active 无回退路径）；**先补删事件、后连带删主行**（顺序理由见 command 注释）。#2 甲档收口
 * （module-p0-async-boundary-correctness 切片 D）：①补删与 ②连带删包单一 `uow.run` 同事务原子——二者适配器均
 * `mikro.fork()`（ALS 感知·事务内复用同一事务 em），故 ②失败/中途抛错 → ①事件删除一并回滚，闭死「主行已没、
 * 事件残留」的孤儿事件窗口（PIPL 不留残迹）；回滚后仍在可整请求重试。EVENT_STORE 直注不受 EVENT_PUBLISH_MODE
 * 开关控制——表在就要清（同 user 硬删先例·S9 教训「显式 `@Inject` + 值导入」）。审计落 pino（库外幸存·乙裁）。
 * @public
 */
@CommandHandler(DeleteOrganizationPermanentlyCommand)
export class DeleteOrganizationPermanentlyCommandHandler
  implements ICommandHandler<DeleteOrganizationPermanentlyCommand>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /**
   * 执行租户硬删连带：非 deleted 终态 → 409；同事务补删事件（租户 + 其下每组织）+ 连带删主行；
   * 并发已没/查无 → null（404 幂等）。
   * @param command - 携带租户 id 与操作者的命令。
   * @returns 硬删结果（租户 id + 连带组织数 + 补删事件数）；行不存在为 `null`。
   *
   * @throws {ConflictException} 租户未处于 deleted 终态时。
   */
  async execute(
    command: DeleteOrganizationPermanentlyCommand,
  ): Promise<TenantHardDeleteResult | null> {
    const detail = await this.governance.findTenantDetail(command.tenantId);
    if (!detail) return null; // 不存在/已被硬删 → 404（幂等）
    if (detail.status !== TENANCY_STATUS.DELETED) {
      await this.audit.logOrganizationGovernance(
        'hard_delete',
        command.tenantId,
        command.operatorId,
        {
          from: detail.status,
          error: 'not_deleted_terminal',
        },
      );
      throw new ConflictException(
        `Tenant ${command.tenantId} is not in deleted terminal state (current: ${detail.status}); soft-delete first`,
        { errorCode: ERROR_CODES.ORG_NOT_DELETED_TERMINAL },
      );
    }

    // 名下组织 id 集（事件双维补删·假设④：`tenant` 聚合下租户生命周期事件记 tenantId·组织领域事件记 orgId）。
    const orgIds = detail.organizations.map((o) => o.organizationId);

    // ①补删 + ②连带删主行 包单 uow.run（#2 甲档·同事务原子·见类头）：②失败/中途抛错则①一并回滚。
    const { purgedEvents, purgedOrgs } = await this.uow.run(async () => {
      // ① 先补删事件：租户本体聚合 + 其下每组织聚合（同 `tenant` aggregateType·id 不同维）。
      let purged = await this.eventStore.deleteByAggregate('tenant', command.tenantId);
      for (const orgId of orgIds) {
        purged += await this.eventStore.deleteByAggregate('tenant', orgId);
      }
      // ② 后连带删主行（先组织·FK cascade 灭各子表·再订阅·再租户本体）。
      const gone = await this.governance.destroyTenant(command.tenantId);
      return { purgedEvents: purged, purgedOrgs: gone.purgedOrgs };
    });
    if (purgedOrgs === 0) {
      // 并发窗口：状态检查后被他人硬删——他方事务原子删租户行同时已清事件，本次①删 0 行、② no-op、
      // 事务提交（租户已没、事件已没·无孤儿）；幂等回 404 留审计。
      await this.audit.logOrganizationGovernance(
        'hard_delete',
        command.tenantId,
        command.operatorId,
        {
          from: TENANCY_STATUS.DELETED,
          error: 'already_gone',
        },
      );
      return null;
    }

    await this.audit.logOrganizationGovernance(
      'hard_delete',
      command.tenantId,
      command.operatorId,
      {
        from: TENANCY_STATUS.DELETED,
        reason: `cascade purged ${purgedOrgs} orgs / ${purgedEvents} events`,
      },
    );
    return { tenantId: command.tenantId, purgedOrgs, purgedEvents };
  }
}

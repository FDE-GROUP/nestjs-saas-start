// S9 铁律：EVENT_STORE 为 Symbol token 必须值导入；EventStore 纯类型面可 import type

import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
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
  TENANT_GOVERNANCE_REPOSITORY,
  type TenantGovernanceRepository,
} from '../../../domain/repositories/tenant-governance.repository';
import {
  DeleteTenantPermanentlyCommand,
  type TenantHardDeleteResult,
} from '../delete-tenant-permanently.command';

/**
 * 硬删租户（NFR-6 删除半·FR-6·平台级）：前置闸仅 `deleted` 终态可消灭（甲裁·两段式
 * 先软后硬，误删 active 无回退路径）；**先补删 tenant 事件、后删主行**（顺序理由见
 * command 注释）。#2 甲档收口（module-p0-async-boundary-correctness 切片 D）：①补删与 ②删主行
 * **包单一 `uow.run`** 同事务原子——二者适配器均 `mikro.fork()`（ALS 感知·事务内复用同一事务 em），
 * 故 ②失败/中途抛错 → ①事件删除一并回滚，闭死「主行已没、事件残留」的孤儿事件窗口（PIPL 不留残迹）；
 * 回滚后 org 仍在可整请求重试。EVENT_STORE 直注不受 EVENT_PUBLISH_MODE 开关控制——表在就要清
 *（同 user 硬删先例·S9 教训显式 @Inject + 值导入）。审计落 pino（库外幸存·乙裁）。
 */
@CommandHandler(DeleteTenantPermanentlyCommand)
export class DeleteTenantPermanentlyCommandHandler
  implements ICommandHandler<DeleteTenantPermanentlyCommand>
{
  constructor(
    @Inject(TENANT_GOVERNANCE_REPOSITORY)
    private readonly governance: TenantGovernanceRepository,
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeleteTenantPermanentlyCommand): Promise<TenantHardDeleteResult | null> {
    const existing = await this.governance.findById(command.organizationId);
    if (!existing) return null; // 不存在/已被硬删 → 404（幂等）
    if (existing.status !== TENANT_STATUS.DELETED) {
      this.audit.logTenantGovernance('hard_delete', command.organizationId, command.operatorId, {
        from: existing.status,
        error: 'not_deleted_terminal',
      });
      throw new ConflictException(
        `Tenant ${command.organizationId} is not in deleted terminal state (current: ${existing.status}); soft-delete first`,
        { errorCode: ERROR_CODES.TENANCY_NOT_DELETED_TERMINAL },
      );
    }

    // ①补删 + ②删主行 包单 uow.run（#2 甲档·同事务原子·见类头）：②失败/中途抛错则①一并回滚。
    const { purgedEvents, destroyed } = await this.uow.run(async () => {
      // ① 先补删事件
      const purged = await this.eventStore.deleteByAggregate('tenant', command.organizationId);
      // ② 后删主行（FK cascade 灭五张子表）
      const gone = await this.governance.destroy(command.organizationId);
      return { purgedEvents: purged, destroyed: gone };
    });
    if (!destroyed) {
      // 并发窗口：状态检查后被他人硬删——他方事务原子删 org 行同时已清事件，本次①删 0 行、② no-op、
      // 事务提交（org 已没、事件已没·无孤儿）；幂等回 404 留审计。
      this.audit.logTenantGovernance('hard_delete', command.organizationId, command.operatorId, {
        from: TENANT_STATUS.DELETED,
        error: 'already_gone',
      });
      return null;
    }

    this.audit.logTenantGovernance('hard_delete', command.organizationId, command.operatorId, {
      from: TENANT_STATUS.DELETED,
    });
    return { organizationId: command.organizationId, purgedEvents };
  }
}

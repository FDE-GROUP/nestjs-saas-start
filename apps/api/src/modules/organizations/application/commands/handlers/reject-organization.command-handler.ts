import { OrganizationRejectedEvent } from '@core/saas-kit/modules/organizations/lifecycle/events/organization-rejected.event';
import {
  ORGANIZATION_STATUS,
  type OrganizationStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_PROVISIONING_REPOSITORY,
  type OrganizationProvisioningRepository,
} from '../../../domain/repositories/organization-provisioning.repository';
import { RejectOrganizationCommand } from '../reject-organization.command';

/**
 * 驳回申请 handler（FR-1·平台级）：硬删 pending 组织行（FK 级联清 member/invitation）。
 *
 * @remarks
 * pending 期零业务
 * 数据）。S5 收紧：仅显式 `pending_approval` 可驳回——已生效/无状态存量 → 409（生效租的暂停/
 * 删除走治理端点），目标不存在 → false（控制层转 404）。成败均经 PlatformAuditService 落
 * 结构化审计（FR-6）。
 * ES 第四切片：硬删成功（removed=true）后产出 `tenant.rejected` 耐久事件——org 行物理
 * 消失后这是「存在过并被驳回」的唯一痕迹（not-found/409 零发·失败连带 500）。
 * Phase B 后半（module-es-outbox-transactional 切片 B）：remove + 发布关键段包入
 * `UNIT_OF_WORK`（outbox 同事务原子·shadow 连带回滚·inproc 空转等价）。
 * @public
 */
@CommandHandler(RejectOrganizationCommand)
export class RejectOrganizationCommandHandler
  implements ICommandHandler<RejectOrganizationCommand>
{
  constructor(
    @Inject(ORGANIZATION_PROVISIONING_REPOSITORY)
    private readonly provisioning: OrganizationProvisioningRepository,
    // 治理换轴归位（rehierarchy E-F）：pending 准入态权威住 `tenant.status`，驳回判据读租户态。
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    // S9 教训：显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    // ES Phase B 后半：ambient UoW（MikroOrmModule @Global 装配·单测直 new 传 pass-through）
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /**
   * 执行驳回：非 pending → 409；同事务硬删并发布 `tenant.rejected`；成败均落审计。
   * @param command - 携带租户 id 与操作者的命令。
   * @returns 硬删命中时为 `true`，行不存在为 `false`。
   *
   * @throws {ConflictException} 申请非 pending 状态、不可驳回时。
   */
  async execute(command: RejectOrganizationCommand): Promise<boolean> {
    // 前置态取自 `tenant.status` 真列（rehierarchy E-F 治理换轴·准入态归位·审批对象为租户准入）。
    const current: OrganizationStatus | undefined = await this.status.read(command.organizationId);
    // 仅显式 pending 可驳回。read 对「不存在」返回 undefined，交给 remove 谓词裁决
    //（命中 0 行 → false → 控制层 404；驳回路径 以 pending 为唯一合法域，FR-1 语义）。
    if (current !== undefined && current !== ORGANIZATION_STATUS.PENDING) {
      await this.audit.logOrganizationGovernance(
        'reject',
        command.organizationId,
        command.operatorId,
        {
          from: current,
          error: 'not_pending',
        },
      );
      throw new ConflictException(
        `Only pending applications can be rejected (status: ${current})`,
        {
          errorCode: ERROR_CODES.ORG_NOT_PENDING,
        },
      );
    }
    const removed = await this.uow.run(() =>
      this.provisioning.remove(command.organizationId).then(async (r) => {
        if (r) {
          const event = new OrganizationRejectedEvent({
            aggregateId: command.organizationId,
            // 关联 id 统一链（FR-4）：请求内非空，后台/脚本场景 undefined → 持久化仍落 null。
            correlationId: currentRequestId(),
            payload: { actorId: command.operatorId },
          });
          await this.events.publishAll([event]);
        }
        return r;
      }),
    );
    await this.audit.logOrganizationGovernance(
      'reject',
      command.organizationId,
      command.operatorId,
      {
        from: removed ? ORGANIZATION_STATUS.PENDING : current,
        to: ORGANIZATION_STATUS.DELETED,
        error: removed ? undefined : 'not_found',
      },
    );
    return removed;
  }
}

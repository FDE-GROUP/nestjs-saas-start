import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';
import { ApproveOrganizationCommand } from '../approve-organization.command';
import { governedOrganizationTransition } from './governed-organization-transition';

/**
 * 审批通过 handler（FR-1·平台级）：`pending_approval → active`，经状态服务统一写回真列。
 *
 * @remarks
 * 经 `TenantStatusService.transition`
 * 统一写回 `tenant.status` 真列（rehierarchy 切片 E-F 治理换轴归位·禁散点手搜对象·S5 起按迁移表严格裁决）。
 * 目标租户不存在 → null（控制层 404）；非法迁移（如已 deleted）→ 409。
 * 成功经 `PlatformAuditService` 产出结构化审计（FR-6）。
 * 架构精度修宪 S4：三分支样板收敛至 `governedOrganizationTransition` 共用用例（薄壳）。
 * @public
 */
@CommandHandler(ApproveOrganizationCommand)
export class ApproveOrganizationCommandHandler
  implements ICommandHandler<ApproveOrganizationCommand>
{
  constructor(
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  /**
   * 执行审批迁移（委派共用治理用例）。
   * @param command - 携带租户 id 与操作者的命令。
   * @returns 迁移后读模型；租户查无为 `null`。
   */
  async execute(
    command: ApproveOrganizationCommand,
  ): Promise<OrganizationApplicationReadModel | null> {
    const result = await governedOrganizationTransition(
      { status: this.status, audit: this.audit },
      {
        action: 'approve',
        organizationId: command.organizationId,
        operatorId: command.operatorId,
        target: TENANCY_STATUS.ACTIVE,
      },
    );
    return result;
  }
}

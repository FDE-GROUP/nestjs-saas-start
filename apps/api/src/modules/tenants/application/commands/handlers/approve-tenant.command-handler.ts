import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';
import { ApproveTenantCommand } from '../approve-tenant.command';
import { governedTenantTransition } from './governed-tenant-transition';

/**
 * 审批通过（FR-1·平台级）：`pending_approval → active`，经 `OrganizationStatusService.transition`
 * 统一写回 `tenant` 户籍表（禁散点手搓对象·S5 起按迁移表严格裁决）。
 * 目标租户不存在 → null（控制层 404）；非法迁移（如已 deleted）→ 409。
 * 成功经 `PlatformAuditService` 产出结构化审计（FR-6）。
 * 架构精度修宪 S4：三分支样板收敛至 `governedTenantTransition` 共用用例（薄壳）。
 */
@CommandHandler(ApproveTenantCommand)
export class ApproveTenantCommandHandler implements ICommandHandler<ApproveTenantCommand> {
  constructor(
    @Inject(OrganizationStatusService) private readonly status: OrganizationStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(command: ApproveTenantCommand): Promise<TenantApplicationReadModel | null> {
    const result = await governedTenantTransition(
      { status: this.status, audit: this.audit },
      {
        action: 'approve',
        organizationId: command.organizationId,
        operatorId: command.operatorId,
        target: ORGANIZATION_STATUS.ACTIVE,
      },
    );
    return result;
  }
}

import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';
import { ResumeTenantCommand } from '../resume-tenant.command';
import { governedTenantTransition } from './governed-tenant-transition';

/**
 * 恢复租户（FR-6·平台级）：`suspended → active`，经 `OrganizationStatusService.transition` 严格裁决
 * （§9.4 迁移表·非法 → 409·不存在 → null 转 404）；撤销中间件 deny-list 失能。落结构化审计。
 * 架构精度修宪 S4：三分支样板收敛至 `governedTenantTransition` 共用用例（薄壳）。
 */
@CommandHandler(ResumeTenantCommand)
export class ResumeTenantCommandHandler implements ICommandHandler<ResumeTenantCommand> {
  constructor(
    @Inject(OrganizationStatusService) private readonly status: OrganizationStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(command: ResumeTenantCommand): Promise<TenantApplicationReadModel | null> {
    const result = await governedTenantTransition(
      { status: this.status, audit: this.audit },
      {
        action: 'resume',
        organizationId: command.organizationId,
        operatorId: command.operatorId,
        target: ORGANIZATION_STATUS.ACTIVE,
      },
    );
    return result;
  }
}

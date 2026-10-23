import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';
import { ResumeOrganizationCommand } from '../resume-organization.command';
import { governedOrganizationTransition } from './governed-organization-transition';

/**
 * 恢复租户（FR-6·平台级）：`suspended → active`，经 `OrganizationStatusService.transition` 严格裁决
 * （§9.4 迁移表·非法 → 409·不存在 → null 转 404）；撤销中间件 deny-list 失能。落结构化审计。
 * 架构精度修宪 S4：三分支样板收敛至 `governedOrganizationTransition` 共用用例（薄壳）。
 */
@CommandHandler(ResumeOrganizationCommand)
export class ResumeOrganizationCommandHandler
  implements ICommandHandler<ResumeOrganizationCommand>
{
  constructor(
    @Inject(OrganizationStatusService) private readonly status: OrganizationStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(
    command: ResumeOrganizationCommand,
  ): Promise<OrganizationApplicationReadModel | null> {
    const result = await governedOrganizationTransition(
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

import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';
import { SuspendOrganizationCommand } from '../suspend-organization.command';
import { governedOrganizationTransition } from './governed-organization-transition';

/**
 * 暂停租户（FR-6/FR-10·平台级）：`active → suspended`，经 `OrganizationStatusService.transition`
 * 严格裁决（§9.4 迁移表·非法 → 409·不存在 → null 转 404），`organization.status` 真列单点写回；
 * 中间件 deny-list 使该租户业务面即时失能。成败均落结构化审计（FR-6）。
 * 架构精度修宪 S4：三分支样板收敛至 `governedOrganizationTransition` 共用用例（薄壳）。
 */
@CommandHandler(SuspendOrganizationCommand)
export class SuspendOrganizationCommandHandler
  implements ICommandHandler<SuspendOrganizationCommand>
{
  constructor(
    @Inject(OrganizationStatusService) private readonly status: OrganizationStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(
    command: SuspendOrganizationCommand,
  ): Promise<OrganizationApplicationReadModel | null> {
    const result = await governedOrganizationTransition(
      { status: this.status, audit: this.audit },
      {
        action: 'suspend',
        organizationId: command.organizationId,
        operatorId: command.operatorId,
        target: ORGANIZATION_STATUS.SUSPENDED,
      },
    );
    return result;
  }
}

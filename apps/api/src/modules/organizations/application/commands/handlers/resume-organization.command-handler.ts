import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantGovernanceResult } from '../../read-models/tenant-governance.read-model';
import { ResumeOrganizationCommand } from '../resume-organization.command';
import { governedTenantTransition } from './governed-tenant-transition';

/**
 * 恢复租户 handler（FR-6·平台级）：`suspended → active`，经状态服务严格裁决。
 *
 * @remarks
 * 治理台改锚 tenant（rehierarchy 片一）：经 `TenantStatusService.transition(tenantId)` 严格裁决
 * （§9.4 迁移表·非法 → 409·不存在 → null 转 404）；撤销中间件 deny-list 失能。落结构化审计。
 * 样板收敛至 `governedTenantTransition` 共用用例（薄壳）。
 * @public
 */
@CommandHandler(ResumeOrganizationCommand)
export class ResumeOrganizationCommandHandler
  implements ICommandHandler<ResumeOrganizationCommand>
{
  constructor(
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  /**
   * 执行恢复迁移（委派共用租户治理用例）。
   * @param command - 携带租户 id 与操作者的命令。
   * @returns 迁移后租户治理回执；租户查无为 `null`。
   */
  async execute(command: ResumeOrganizationCommand): Promise<TenantGovernanceResult | null> {
    return governedTenantTransition(
      { status: this.status, audit: this.audit },
      {
        action: 'resume',
        tenantId: command.tenantId,
        operatorId: command.operatorId,
        target: TENANT_STATUS.ACTIVE,
      },
    );
  }
}

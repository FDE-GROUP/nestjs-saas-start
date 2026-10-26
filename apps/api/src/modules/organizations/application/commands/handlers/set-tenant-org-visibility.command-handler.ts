import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { TenantOrgVisibilityResult } from '../../read-models/tenant-governance.read-model';
import { SetTenantOrgVisibilityCommand } from '../set-tenant-org-visibility.command';

/**
 * 租内可见性策略设置 handler（第三次复裁 · 切片 3·D2·平台级）。
 *
 * @remarks
 * 经治理仓储端口写 `tenant.orgVisibility`（平台级天然跨租户·无租户 ALS 上下文·纯 SQL UPDATE 不触隔离 filter）：
 * 租户查无 → null（控制层转 404）。成功经 `PlatformAuditService` 产出 `set_visibility` 结构化审计
 *（FR-6 单点·禁散点手搓）。本 handler 不裁决租户准入态——策略是每租户机密维开关，非生命周期迁移。
 * @public
 */
@CommandHandler(SetTenantOrgVisibilityCommand)
export class SetTenantOrgVisibilityCommandHandler
  implements ICommandHandler<SetTenantOrgVisibilityCommand>
{
  constructor(
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入（Symbol 端口）。
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  /**
   * 执行可见性策略设置。
   * @param command - 携带租户 id、目标策略与操作者的命令。
   * @returns 设置后的回执；租户查无为 `null`。
   */
  async execute(command: SetTenantOrgVisibilityCommand): Promise<TenantOrgVisibilityResult | null> {
    const result = await this.governance.setOrgVisibility(command.tenantId, command.orgVisibility);
    if (!result) return null;
    await this.audit.logOrganizationGovernance(
      'set_visibility',
      command.tenantId,
      command.operatorId,
      { reason: `orgVisibility=${command.orgVisibility}` },
    );
    return result;
  }
}

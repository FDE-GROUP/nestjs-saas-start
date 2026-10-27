import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantGovernanceResult } from '../../read-models/tenant-governance.read-model';
import { DeleteOrganizationCommand } from '../delete-organization.command';

/**
 * 软删租户 handler（FR-6·NFR-6·平台级）：迁至 `deleted` 终态（§9.4），经 `TenantStatusService.transition(tenantId)` 写回 `tenant.status`（rehierarchy E-F 治理换轴归位）。
 *
 * @remarks
 * 治理台改锚 tenant（rehierarchy 片一）：软删作用于**租户准入态**——封禁整个租户（其下所有组织随中间件 deny-list 失能）。
 * 中间件 deny-list 即时失能。已 deleted 再删 → 非法迁移 409；不存在 → null（404）。落结构化审计。
 * @public
 */
@CommandHandler(DeleteOrganizationCommand)
export class DeleteOrganizationCommandHandler
  implements ICommandHandler<DeleteOrganizationCommand>
{
  constructor(
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  /**
   * 执行软删迁移；非法（已 deleted）→ 409；查无 → null；成败均落审计。
   * @param command - 携带租户 id 与操作者的命令。
   * @returns 迁移后租户治理回执；租户查无为 `null`。
   *
   * @throws {ConflictException} 租户生命周期迁移非法时。
   */
  async execute(command: DeleteOrganizationCommand): Promise<TenantGovernanceResult | null> {
    const result = await this.status.transition(command.tenantId, TENANT_STATUS.DELETED, {
      actorId: command.operatorId,
      reason: 'platform_delete',
    });
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      await this.audit.logOrganizationGovernance('delete', command.tenantId, command.operatorId, {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      });
      throw new ConflictException(
        `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
        { errorCode: ERROR_CODES.ORG_ILLEGAL_TRANSITION },
      );
    }
    await this.audit.logOrganizationGovernance('delete', command.tenantId, command.operatorId, {
      from: result.previous,
      to: result.status,
    });
    return { tenantId: command.tenantId, status: result.status };
  }
}

import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';
import { DeleteOrganizationCommand } from '../delete-organization.command';

/**
 * 软删租户 handler（FR-6·NFR-6·平台级）：迁至 `deleted` 终态（§9.4），保留行供后续导出/硬删。
 *
 * @remarks
 * 中间件 deny-list 即时失能。已 deleted 再删 → 非法迁移 409；不存在 → null（404）。落结构化审计。
 * @public
 */
@CommandHandler(DeleteOrganizationCommand)
export class DeleteOrganizationCommandHandler
  implements ICommandHandler<DeleteOrganizationCommand>
{
  constructor(
    @Inject(OrganizationStatusService) private readonly status: OrganizationStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  /**
   * 执行软删迁移；非法（已 deleted）→ 409；查无 → null；成败均落审计。
   * @param command - 携带租户 id 与操作者的命令。
   * @returns 迁移后读模型；租户查无为 `null`。
   */
  async execute(
    command: DeleteOrganizationCommand,
  ): Promise<OrganizationApplicationReadModel | null> {
    const result = await this.status.transition(
      command.organizationId,
      ORGANIZATION_STATUS.DELETED,
      {
        actorId: command.operatorId,
        reason: 'platform_delete',
      },
    );
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      await this.audit.logOrganizationGovernance(
        'delete',
        command.organizationId,
        command.operatorId,
        {
          from: result.from,
          to: result.to,
          error: 'illegal_transition',
        },
      );
      throw new ConflictException(
        `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
        { errorCode: ERROR_CODES.ORG_ILLEGAL_TRANSITION },
      );
    }
    await this.audit.logOrganizationGovernance(
      'delete',
      command.organizationId,
      command.operatorId,
      {
        from: result.previous,
        to: result.status,
      },
    );
    return { organizationId: command.organizationId, status: result.status };
  }
}

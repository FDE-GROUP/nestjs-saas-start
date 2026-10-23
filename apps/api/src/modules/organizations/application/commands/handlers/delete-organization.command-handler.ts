import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';
import { DeleteOrganizationCommand } from '../delete-organization.command';

/**
 * 软删租户（FR-6·NFR-6·平台级）：迁至 `deleted` 终态（§9.4），保留行供后续按租户导出/硬删；
 * 中间件 deny-list 即时失能。已 deleted 再删 → 非法迁移 409；不存在 → null（404）。落结构化审计。
 */
@CommandHandler(DeleteOrganizationCommand)
export class DeleteOrganizationCommandHandler
  implements ICommandHandler<DeleteOrganizationCommand>
{
  constructor(
    @Inject(OrganizationStatusService) private readonly status: OrganizationStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

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

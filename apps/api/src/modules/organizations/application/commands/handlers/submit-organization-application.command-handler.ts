import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_PROVISIONING_REPOSITORY,
  type OrganizationProvisioningRepository,
} from '../../../domain/repositories/organization-provisioning.repository';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';
import { SubmitOrganizationApplicationCommand } from '../submit-organization-application.command';

/**
 * 申请创建租户（FR-1·用户级能力）：经 provisioning gateway 落 pending 组织，
 * 强制盖 `pending_approval`、申请人经 BA 成为首名 owner（FR-12）。命令携带的 userId
 * 源自会话（非请求体），gateway 以系统动作调用 Better Auth，绕过 HTTP 自助封禁。
 */
@CommandHandler(SubmitOrganizationApplicationCommand)
export class SubmitOrganizationApplicationCommandHandler
  implements ICommandHandler<SubmitOrganizationApplicationCommand>
{
  constructor(
    @Inject(ORGANIZATION_PROVISIONING_REPOSITORY)
    private readonly provisioning: OrganizationProvisioningRepository,
  ) {}

  async execute(
    command: SubmitOrganizationApplicationCommand,
  ): Promise<OrganizationApplicationReadModel> {
    const receipt = await this.provisioning.submit(command.userId, command.name, command.slug);
    return { organizationId: receipt.organizationId, status: receipt.status };
  }
}

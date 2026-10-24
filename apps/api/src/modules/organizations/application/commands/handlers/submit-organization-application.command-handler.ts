import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_PROVISIONING_REPOSITORY,
  type OrganizationProvisioningRepository,
} from '../../../domain/repositories/organization-provisioning.repository';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';
import { SubmitOrganizationApplicationCommand } from '../submit-organization-application.command';

/**
 * 申请创建租户 handler（FR-1·用户级能力）：经 provisioning gateway 落 pending 组织。
 *
 * @remarks
 * 强制盖 `pending_approval`、申请人经 BA 成为首名 owner（FR-12）。命令携带的 userId
 * 源自会话（非请求体），gateway 以系统动作调用 Better Auth，绕过 HTTP 自助封禁。
 * @public
 */
@CommandHandler(SubmitOrganizationApplicationCommand)
export class SubmitOrganizationApplicationCommandHandler
  implements ICommandHandler<SubmitOrganizationApplicationCommand>
{
  constructor(
    @Inject(ORGANIZATION_PROVISIONING_REPOSITORY)
    private readonly provisioning: OrganizationProvisioningRepository,
  ) {}

  /**
   * 执行申请落地：系统动作建 pending 组织并回回执读模型。
   * @param command - 携带申请人/组织名/slug 的命令。
   * @returns 落地回执读模型（组织 id + 当前态）。
   */
  async execute(
    command: SubmitOrganizationApplicationCommand,
  ): Promise<OrganizationApplicationReadModel> {
    const receipt = await this.provisioning.submit(command.userId, command.name, command.slug);
    return { organizationId: receipt.organizationId, status: receipt.status };
  }
}

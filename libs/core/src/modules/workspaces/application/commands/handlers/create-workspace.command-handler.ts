import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TenantIsolationService } from '../../../../../tenant-isolation/tenant-isolation.service';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { CreateWorkspaceCommand } from '../create-workspace.command';

/**
 * 属主盖章单点（module-workspace-owner-column·人裁③）：`ownerId` 取自可信会话（ALS userId），
 * **不经 command/body**（伪造面为零）；无 userId 上下文 → 落 NULL（人裁② fail-closed 语义：
 * 受限 grant 下不可见），不 throw——创建动作的上游守卫面不变。与 list 片 handler 侧取谓词同构。
 */
@CommandHandler(CreateWorkspaceCommand)
export class CreateWorkspaceCommandHandler implements ICommandHandler<CreateWorkspaceCommand> {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
  ) {}

  async execute(command: CreateWorkspaceCommand): Promise<WorkspaceReadModel> {
    return this.workspaces.create({
      name: command.name,
      slug: command.slug,
      ownerId: this.tenant.userId,
    });
  }
}

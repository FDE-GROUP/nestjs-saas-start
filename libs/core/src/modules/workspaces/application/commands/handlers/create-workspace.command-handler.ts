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
 * 创建 workspace 的写侧命令处理器（属主盖章单点）。
 *
 * @remarks
 * 属主盖章单点（module-workspace-owner-column·人裁③）：`ownerId` 取自可信会话（ALS userId），
 * **不经 command/body**（伪造面为零）；无 userId 上下文 → 落 NULL（人裁② fail-closed 语义：
 * 受限 grant 下不可见），不 throw——创建动作的上游守卫面不变。与 list 片 handler 侧取谓词同构。
 *
 * @public
 */
@CommandHandler(CreateWorkspaceCommand)
export class CreateWorkspaceCommandHandler implements ICommandHandler<CreateWorkspaceCommand> {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
  ) {}

  /**
   * 以可信会话 userId 盖章属主后调仓储创建 workspace。
   *
   * @param command - 待执行的创建命令（name/slug）
   * @returns 新建 workspace 的读模型
   */
  async execute(command: CreateWorkspaceCommand): Promise<WorkspaceReadModel> {
    return this.workspaces.create({
      name: command.name,
      slug: command.slug,
      ownerId: this.tenant.userId,
    });
  }
}

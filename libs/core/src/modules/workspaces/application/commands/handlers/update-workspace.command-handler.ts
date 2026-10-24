import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { UpdateWorkspaceCommand } from '../update-workspace.command';

/**
 * 更新 workspace 的写侧命令处理器（仓储按可信租户收窄·非本租返回 null）。
 *
 * @public
 */
@CommandHandler(UpdateWorkspaceCommand)
export class UpdateWorkspaceCommandHandler implements ICommandHandler<UpdateWorkspaceCommand> {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  /**
   * 委托仓储更新归属活动租户的 workspace。
   *
   * @param command - 待执行的更新命令（id/name/slug）
   * @returns 更新后的读模型；非本租/不存在返回 `null`
   */
  async execute(command: UpdateWorkspaceCommand): Promise<WorkspaceReadModel | null> {
    return this.workspaces.update(command.id, { name: command.name, slug: command.slug });
  }
}

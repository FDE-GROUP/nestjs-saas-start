import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import { DeleteWorkspaceCommand } from '../delete-workspace.command';

/**
 * 删除 workspace 的写侧命令处理器（仓储按可信租户收窄·跨租 id 命中 0 行）。
 *
 * @public
 */
@CommandHandler(DeleteWorkspaceCommand)
export class DeleteWorkspaceCommandHandler implements ICommandHandler<DeleteWorkspaceCommand> {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  /**
   * 委托仓储删除归属活动租户的 workspace。
   *
   * @param command - 待执行的删除命令（id）
   * @returns 命中并删除返回 `true`；否则 `false`
   */
  async execute(command: DeleteWorkspaceCommand): Promise<boolean> {
    return this.workspaces.remove(command.id);
  }
}

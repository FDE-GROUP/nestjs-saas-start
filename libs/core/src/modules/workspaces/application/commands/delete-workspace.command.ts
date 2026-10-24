import { BaseCommand } from '../../../../shared-kernel/cqrs/types';

/**
 * 删除活动租户内某 workspace 的命令（仓储按可信租户 id 收窄）。
 *
 * @remarks
 * Delete a workspace within the active tenant (repository scopes by trusted tenant id).
 *
 * @public
 */
export class DeleteWorkspaceCommand extends BaseCommand<boolean> {
  constructor(readonly id: string) {
    super();
  }
}

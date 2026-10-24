import { BaseCommand } from '../../../../shared-kernel/cqrs/types';
import type { WorkspaceReadModel } from '../read-models/workspace.read-model';

/**
 * 更新活动租户内某 workspace 的命令（仓储按可信租户 id 收窄）。
 *
 * @remarks
 * Update a workspace within the active tenant (repository scopes by trusted tenant id).
 *
 * @public
 */
export class UpdateWorkspaceCommand extends BaseCommand<WorkspaceReadModel | null> {
  constructor(
    readonly id: string,
    readonly name?: string,
    readonly slug?: string,
  ) {
    super();
  }
}

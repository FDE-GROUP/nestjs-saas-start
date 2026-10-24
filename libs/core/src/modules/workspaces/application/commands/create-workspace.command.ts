import { BaseCommand } from '../../../../shared-kernel/cqrs/types';
import type { WorkspaceReadModel } from '../read-models/workspace.read-model';

/**
 * 创建租户内 workspace 的写侧意图命令（仅携原语·不属 DTO）。
 *
 * @remarks
 * Write-side intent to create a tenant-owned workspace. Carries primitives only; the owning
 * tenant is NOT a field — it is stamped from the trusted context by the repository.
 *
 * @public
 */
export class CreateWorkspaceCommand extends BaseCommand<WorkspaceReadModel> {
  constructor(
    readonly name: string,
    readonly slug: string,
  ) {
    super();
  }
}

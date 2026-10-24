import { BaseQuery } from '../../../../shared-kernel/cqrs/types';
import type { Page, PageRequest } from '../../../../shared-kernel/domain/pagination';
import type { WorkspaceReadModel } from '../read-models/workspace.read-model';

/**
 * 列出活动租户内 workspace 的读侧查询（不带租户参——scope 在下游强制）。
 *
 * @remarks
 * List workspaces within the active tenant (no tenant arg — scope is enforced downstream).
 *
 * @public
 */
export class ListWorkspacesQuery extends BaseQuery<Page<WorkspaceReadModel>> {
  constructor(readonly request: PageRequest) {
    super();
  }
}

import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { CreateWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/create-workspace.command';
import { DeleteWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/delete-workspace.command';
import { UpdateWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/update-workspace.command';
import { ListWorkspacesQuery } from '@core/saas-kit/modules/workspaces/application/queries/list-workspaces.query';
import type { WorkspaceReadModel } from '@core/saas-kit/modules/workspaces/application/read-models/workspace.read-model';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { Controller, Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Impl } from '@orpc/nest';
import {
  workspacesCreateContract,
  workspacesCreateMeta,
  workspacesListContract,
  workspacesListMeta,
  workspacesRemoveContract,
  workspacesRemoveMeta,
  workspacesUpdateContract,
  workspacesUpdateMeta,
} from '@saas/api-contract/index';
import {
  createWorkspaceSchema,
  listPageQuerySchema,
  updateWorkspaceInputSchema,
  type WorkspacePage,
  workspaceIdParamSchema,
  workspacePageSchema,
  workspaceViewSchema,
} from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';

/**
 * 工作区 CRUD 参考切片的 HTTP 控制器（多租户 S3 · D2/§9.1 / FR-4/FR-5）。
 *
 * @remarks
 * Workspace CRUD reference slice (global-tenancy S3 · D2/§9.1 / FR-4/FR-5).
 *
 * Both guards run per-route (NOT global — APP_GUARD stays a signed decision, 高危#4):
 * - `TenantIsolationGuard`: fail-closed — no active tenant → 403.
 * - `AuthorizationGuard`: delegates the capability check to Better Auth `ac` (single
 *   source of truth), so role→permission mapping is never scattered here.
 *
 * Permission tiers (S3 human call): `workspace:read` for all members;
 * `workspace:create/update/delete` for owner+admin. Row scoping by tenant is enforced in
 * the repository — handlers/controllers never name a tenant id.
 * @public
 */
// 换轨 WP-C：四条路由全部转 per-method `@Impl`（单 ProcedureContract·非 router 扇出）——@Can 仍落
// 在本方法上，class 级 `@UseGuards(TenantIsolationGuard, AuthorizationGuard)` + 方法级 `@Can` 原生生效（守卫墙不弱化）。
// update/remove 的 in-handler `NotFoundException`（含 errorCode）经 WP-D 错误面承接逐字复原 REST 信封；
// `:id` 路径参经紧凑 input 结构（`{...body, ...params}` 平并）落到合并 input schema（`@saas/contracts` 单源）。
// 契约 meta.path 现为绝对段（`/workspaces`·换轨 B-5 路径单源前置 lib）·`@Controller('')` 让 @Impl 按 meta 原样挂载，合成最终 /workspaces（prod 加前缀版本后 /api/v1/workspaces）。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export {
  workspacesCreateContract,
  workspacesListContract,
  workspacesRemoveContract,
  workspacesUpdateContract,
};

@Controller('')
@UseGuards(TenantIsolationGuard, AuthorizationGuard)
export class WorkspacesController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 分页列出当前组织下的工作区（offset 分页）。
   * @returns 当前组织拥有的工作区分页。
   */
  @Can('read', 'Workspace')
  @Impl(workspacesListContract)
  list() {
    return os
      .input(listPageQuerySchema)
      .output(workspacePageSchema)
      .meta(workspacesListMeta)
      .handler(({ input }) =>
        this.queryBus.execute<ListWorkspacesQuery, WorkspacePage>(new ListWorkspacesQuery(input)),
      );
  }

  /**
   * 创建工作区（owner/admin）。
   * @returns 已落库并盖章当前组织的工作区。
   */
  @Can('create', 'Workspace')
  @Impl(workspacesCreateContract)
  create() {
    return os
      .input(createWorkspaceSchema)
      .output(workspaceViewSchema)
      .meta(workspacesCreateMeta)
      .handler(({ input }) =>
        this.commandBus.execute<CreateWorkspaceCommand, WorkspaceReadModel>(
          new CreateWorkspaceCommand(input.name, input.slug),
        ),
      );
  }

  /**
   * 更新工作区（owner/admin）。
   * @returns 更新后的工作区；未命中则 404（经 WP-D 错误面承接逐字复原）。
   */
  @Can('update', 'Workspace')
  @Impl(workspacesUpdateContract)
  update() {
    return os
      .input(updateWorkspaceInputSchema)
      .output(workspaceViewSchema)
      .meta(workspacesUpdateMeta)
      .handler(async ({ input }) => {
        const result = await this.commandBus.execute<
          UpdateWorkspaceCommand,
          WorkspaceReadModel | null
        >(new UpdateWorkspaceCommand(input.id, input.name, input.slug));
        if (!result) {
          throw new NotFoundException('Workspace not found', {
            errorCode: ERROR_CODES.WORKSPACE_NOT_FOUND,
          });
        }
        return result;
      });
  }

  /**
   * 删除工作区（owner/admin）。
   * @returns 无内容（204）；未命中则 404（经 WP-D 错误面承接逐字复原）。
   */
  @Can('delete', 'Workspace')
  @Impl(workspacesRemoveContract)
  remove() {
    return os
      .input(workspaceIdParamSchema)
      .meta(workspacesRemoveMeta)
      .handler(async ({ input }) => {
        const deleted = await this.commandBus.execute<DeleteWorkspaceCommand, boolean>(
          new DeleteWorkspaceCommand(input.id),
        );
        if (!deleted) {
          throw new NotFoundException('Workspace not found', {
            errorCode: ERROR_CODES.WORKSPACE_NOT_FOUND,
          });
        }
      });
  }
}

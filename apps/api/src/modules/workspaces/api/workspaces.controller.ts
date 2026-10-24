import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { CreateWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/create-workspace.command';
import { DeleteWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/delete-workspace.command';
import { UpdateWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/update-workspace.command';
import { ListWorkspacesQuery } from '@core/saas-kit/modules/workspaces/application/queries/list-workspaces.query';
import type { WorkspaceReadModel } from '@core/saas-kit/modules/workspaces/application/read-models/workspace.read-model';
import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type CreateWorkspace,
  createWorkspaceSchema,
  type ListPageQuery,
  listPageQuerySchema,
  type UpdateWorkspace,
  updateWorkspaceSchema,
  workspacePageSchema,
  workspaceViewSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { WorkspacePageResponse, WorkspaceResponse } from './response/workspace.response';

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
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, WorkspaceResponse, WorkspacePageResponse)
@ApiTags('workspaces')
@Controller('workspaces')
@UseGuards(TenantIsolationGuard, AuthorizationGuard)
export class WorkspacesController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 分页列出当前组织下的工作区（offset 分页）。
   * @param request - offset 分页请求。
   * @returns 当前组织拥有的工作区分页。
   */
  @Get()
  @Can('read', 'Workspace')
  @SerializeOptions({ schema: workspacePageSchema })
  @ApiOperation({ summary: 'List workspaces in the active organization' })
  @ApiResponse(
    apiEnvelopeShape(WorkspacePageResponse, {
      description: 'Workspaces owned by the active organization (offset page).',
    }),
  )
  @ApiResponse(apiError(403, 'No active organization, or missing workspace:read.'))
  list(
    @Query({ schema: listPageQuerySchema }) request: ListPageQuery,
  ): Promise<Page<WorkspaceReadModel>> {
    return this.queryBus.execute<ListWorkspacesQuery, Page<WorkspaceReadModel>>(
      new ListWorkspacesQuery(request),
    );
  }

  /**
   * 创建工作区（owner/admin）。
   * @param dto - 创建入参（name/slug）。
   * @returns 已落库并盖章当前组织的工作区。
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Can('create', 'Workspace')
  @SerializeOptions({ schema: workspaceViewSchema })
  @ApiOperation({ summary: 'Create a workspace (owner/admin)' })
  @ApiResponse(
    apiEnvelopeShape(WorkspaceResponse, {
      status: 201,
      description: 'Created workspace stamped with the active organization.',
    }),
  )
  @ApiResponse(apiError(403, 'Missing workspace:create (members are rejected).'))
  create(
    @Body({ schema: createWorkspaceSchema }) dto: CreateWorkspace,
  ): Promise<WorkspaceReadModel> {
    return this.commandBus.execute<CreateWorkspaceCommand, WorkspaceReadModel>(
      new CreateWorkspaceCommand(dto.name, dto.slug),
    );
  }

  /**
   * 更新工作区（owner/admin）。
   * @param id - 工作区主键。
   * @param dto - 更新入参（name/slug）。
   * @returns 更新后的工作区；未命中则抛 404。
   *
   * @throws {NotFoundException} 工作区不存在时。
   */
  @Patch(':id')
  @Can('update', 'Workspace')
  @SerializeOptions({ schema: workspaceViewSchema })
  @ApiOperation({ summary: 'Update a workspace (owner/admin)' })
  @ApiResponse(apiEnvelopeShape(WorkspaceResponse, { description: 'Updated workspace.' }))
  @ApiResponse(apiError(404, 'Workspace not found in the active organization.'))
  async update(
    @Param('id') id: string,
    @Body({ schema: updateWorkspaceSchema }) dto: UpdateWorkspace,
  ): Promise<WorkspaceReadModel> {
    const result = await this.commandBus.execute<UpdateWorkspaceCommand, WorkspaceReadModel | null>(
      new UpdateWorkspaceCommand(id, dto.name, dto.slug),
    );
    if (!result)
      throw new NotFoundException('Workspace not found', {
        errorCode: ERROR_CODES.WORKSPACE_NOT_FOUND,
      });
    return result;
  }

  /**
   * 删除工作区（owner/admin）。
   * @param id - 工作区主键。
   * @returns 无内容（204）；未命中则抛 404。
   *
   * @throws {NotFoundException} 工作区不存在时。
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Can('delete', 'Workspace')
  @ApiOperation({ summary: 'Delete a workspace (owner/admin)' })
  @ApiResponse({ status: 204, description: 'Workspace deleted.' })
  @ApiResponse(apiError(404, 'Workspace not found in the active organization.'))
  async remove(@Param('id') id: string): Promise<void> {
    const deleted = await this.commandBus.execute<DeleteWorkspaceCommand, boolean>(
      new DeleteWorkspaceCommand(id),
    );
    if (!deleted)
      throw new NotFoundException('Workspace not found', {
        errorCode: ERROR_CODES.WORKSPACE_NOT_FOUND,
      });
  }
}

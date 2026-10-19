import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantPermissionGuard } from '@core/saas-kit/authorization/tenant-permission.guard';
import { CreateWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/create-workspace.command';
import { DeleteWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/delete-workspace.command';
import { UpdateWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/update-workspace.command';
import { ListWorkspacesQuery } from '@core/saas-kit/modules/workspaces/application/queries/list-workspaces.query';
import type { WorkspaceReadModel } from '@core/saas-kit/modules/workspaces/application/read-models/workspace.read-model';
import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantScopeGuard } from '@core/saas-kit/tenancy/tenant-scope.guard';
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
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type CreateWorkspace,
  createWorkspaceSchema,
  type ListPageQuery,
  listPageQuerySchema,
  type UpdateWorkspace,
  updateWorkspaceSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { WorkspacePageResponse, WorkspaceResponse } from './response/workspace.response';

/**
 * Workspace CRUD reference slice (global-tenancy S3 · D2/§9.1 / FR-4/FR-5).
 *
 * Both guards run per-route (NOT global — APP_GUARD stays a signed decision, 高危#4):
 * - `TenantScopeGuard`: fail-closed — no active tenant → 403.
 * - `TenantPermissionGuard`: delegates the capability check to Better Auth `ac` (single
 *   source of truth), so role→permission mapping is never scattered here.
 *
 * Permission tiers (S3 human call): `workspace:read` for all members;
 * `workspace:create/update/delete` for owner+admin. Row scoping by tenant is enforced in
 * the repository — handlers/controllers never name a tenant id.
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, WorkspaceResponse, WorkspacePageResponse)
@ApiTags('workspaces')
@Controller('workspaces')
@UseGuards(TenantScopeGuard, TenantPermissionGuard)
export class WorkspacesController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @Can('read', 'Workspace')
  @ApiOperation({ summary: 'List workspaces in the active tenant' })
  @ApiResponse(
    apiEnvelopeShape(WorkspacePageResponse, {
      description: 'Workspaces owned by the active tenant (offset page).',
    }),
  )
  @ApiResponse(apiError(403, 'No active tenant, or missing workspace:read.'))
  list(
    @Query({ schema: listPageQuerySchema }) request: ListPageQuery,
  ): Promise<Page<WorkspaceReadModel>> {
    return this.queryBus.execute<ListWorkspacesQuery, Page<WorkspaceReadModel>>(
      new ListWorkspacesQuery(request),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Can('create', 'Workspace')
  @ApiOperation({ summary: 'Create a workspace (owner/admin)' })
  @ApiResponse(
    apiEnvelopeShape(WorkspaceResponse, {
      status: 201,
      description: 'Created workspace stamped with the active tenant.',
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

  @Patch(':id')
  @Can('update', 'Workspace')
  @ApiOperation({ summary: 'Update a workspace (owner/admin)' })
  @ApiResponse(apiEnvelopeShape(WorkspaceResponse, { description: 'Updated workspace.' }))
  @ApiResponse(apiError(404, 'Workspace not found in the active tenant.'))
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Can('delete', 'Workspace')
  @ApiOperation({ summary: 'Delete a workspace (owner/admin)' })
  @ApiResponse({ status: 204, description: 'Workspace deleted.' })
  @ApiResponse(apiError(404, 'Workspace not found in the active tenant.'))
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

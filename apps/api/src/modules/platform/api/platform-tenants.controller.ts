import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { DeleteTenantCommand } from '@app/modules/tenants/application/commands/delete-tenant.command';
import {
  DeleteTenantPermanentlyCommand,
  type TenantHardDeleteResult,
} from '@app/modules/tenants/application/commands/delete-tenant-permanently.command';
import { ResumeTenantCommand } from '@app/modules/tenants/application/commands/resume-tenant.command';
import { SuspendTenantCommand } from '@app/modules/tenants/application/commands/suspend-tenant.command';
import { ExportTenantDataQuery } from '@app/modules/tenants/application/queries/export-tenant-data.query';
import { GetPlatformTenantQuery } from '@app/modules/tenants/application/queries/get-platform-tenant.query';
import { GetTenantDiagnosticsQuery } from '@app/modules/tenants/application/queries/get-tenant-diagnostics.query';
import { ListPlatformTenantsQuery } from '@app/modules/tenants/application/queries/list-platform-tenants.query';
import type {
  PlatformTenantPage,
  PlatformTenantRow,
  TenantDiagnostics,
} from '@app/modules/tenants/application/read-models/platform-tenant.read-model';
import type { TenantApplicationReadModel } from '@app/modules/tenants/application/read-models/tenant-application.read-model';
import type { TenantDataExport } from '@app/modules/tenants/application/read-models/tenant-data-export.read-model';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantExempt } from '@core/saas-kit/tenancy/tenant-exempt.decorator';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type ListPlatformTenantsQuery as ListPlatformTenantsQueryDto,
  listPlatformTenantsQuerySchema,
  platformTenantPageSchema,
  platformTenantRowSchema,
  tenantApplicationViewSchema,
  tenantDiagnosticsSchema,
  tenantHardDeleteResultSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
  apiOkPassthrough,
} from '../../../common/contracts/api-contracts';
import { TenantApplicationResponse } from '../../tenants/api/response/tenant-application.response';
import {
  PlatformTenantPageResponse,
  PlatformTenantRowResponse,
  TenantDiagnosticsResponse,
  TenantHardDeleteResultResponse,
} from './response/governance.response';

/**
 * Platform operator governance slice (global-tenancy S5 · FR-6/FR-11①/FR-13).
 *
 * Every route is gated by `PlatformOperatorGuard` (the sole cross-tenant authority —
 * the unique platform operator, DB email matches `platform.operatorEmail`, fail-closed).
 * These handlers read/write WITHOUT a tenant scope on purpose: platform-level governance
 * spans all tenants (FR-11①), so they deliberately never bind TenantScopeGuard.
 *
 * Lifecycle transitions route through `TenantStatusService.transition` (single choke-point on
 * the `tenant.status` column, §9.4 state machine): suspend (active→suspended), resume (suspended→active),
 * delete (soft→deleted terminal). Each success/failure emits a structured audit line (FR-6).
 */
@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  PlatformTenantPageResponse,
  PlatformTenantRowResponse,
  TenantDiagnosticsResponse,
  TenantHardDeleteResultResponse,
  TenantApplicationResponse,
)
@ApiTags('platform')
// S11 复合全局：跨租平台治理（列表/详情/诊断/suspend·resume·delete）无关单一租户上下文 → 类级豁免租户墙。
@TenantExempt()
@Controller('platform/tenants')
@UseGuards(PlatformOperatorGuard)
export class PlatformTenantsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @SerializeOptions({ schema: platformTenantPageSchema })
  @ApiOperation({ summary: 'List all tenants across the platform (operator only)' })
  @ApiResponse(
    apiEnvelopeShape(PlatformTenantPageResponse, {
      description: 'A page of tenants with lifecycle status.',
    }),
  )
  @ApiResponse(apiError(403, 'Not the platform operator.'))
  list(
    @Query({ schema: listPlatformTenantsQuerySchema }) dto: ListPlatformTenantsQueryDto,
  ): Promise<PlatformTenantPage> {
    return this.queryBus.execute<ListPlatformTenantsQuery, PlatformTenantPage>(
      new ListPlatformTenantsQuery(dto.limit, dto.offset, dto.search),
    );
  }

  @Get(':id')
  @SerializeOptions({ schema: platformTenantRowSchema })
  @ApiOperation({ summary: 'Get one tenant (operator only)' })
  @ApiResponse(apiEnvelopeShape(PlatformTenantRowResponse, { description: 'Tenant row.' }))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  async detail(@Param('id') id: string): Promise<PlatformTenantRow> {
    const row = await this.queryBus.execute<GetPlatformTenantQuery, PlatformTenantRow | null>(
      new GetPlatformTenantQuery(id),
    );
    if (!row)
      throw new NotFoundException('Tenant not found', { errorCode: ERROR_CODES.TENANCY_NOT_FOUND });
    return row;
  }

  @Get(':id/diagnostics')
  @SerializeOptions({ schema: tenantDiagnosticsSchema })
  @ApiOperation({ summary: 'Per-tenant diagnostics: member/invitation/workspace/post counts' })
  @ApiResponse(apiEnvelopeShape(TenantDiagnosticsResponse, { description: 'Diagnostics bundle.' }))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  async diagnostics(@Param('id') id: string): Promise<TenantDiagnostics> {
    const diag = await this.queryBus.execute<GetTenantDiagnosticsQuery, TenantDiagnostics | null>(
      new GetTenantDiagnosticsQuery(id),
    );
    if (!diag)
      throw new NotFoundException('Tenant not found', { errorCode: ERROR_CODES.TENANCY_NOT_FOUND });
    return diag;
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export all tenant-owned data as a single JSON payload (NFR-6)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Six-section tenant data export (credentials excluded)',
      ssotHint: 'TenantDataExport（bulk-export·六段聚合）',
    }),
  )
  @ApiResponse(apiError(404, 'Tenant not found.'))
  async exportData(@Param('id') id: string): Promise<TenantDataExport> {
    const payload = await this.queryBus.execute<ExportTenantDataQuery, TenantDataExport | null>(
      new ExportTenantDataQuery(id),
    );
    if (!payload)
      throw new NotFoundException('Tenant not found', { errorCode: ERROR_CODES.TENANCY_NOT_FOUND });
    return payload;
  }

  @Patch(':id/suspend')
  @SerializeOptions({ schema: tenantApplicationViewSchema })
  @ApiOperation({ summary: 'Suspend an active tenant (active → suspended · fail-closed失能)' })
  @ApiResponse(apiEnvelopeShape(TenantApplicationResponse, { description: 'Tenant suspended.' }))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async suspend(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      SuspendTenantCommand,
      TenantApplicationReadModel | null
    >(new SuspendTenantCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', { errorCode: ERROR_CODES.TENANCY_NOT_FOUND });
    return result;
  }

  @Patch(':id/resume')
  @SerializeOptions({ schema: tenantApplicationViewSchema })
  @ApiOperation({ summary: 'Resume a suspended tenant (suspended → active)' })
  @ApiResponse(apiEnvelopeShape(TenantApplicationResponse, { description: 'Tenant resumed.' }))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      ResumeTenantCommand,
      TenantApplicationReadModel | null
    >(new ResumeTenantCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', { errorCode: ERROR_CODES.TENANCY_NOT_FOUND });
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantApplicationViewSchema })
  @ApiOperation({ summary: 'Soft-delete a tenant (→ deleted terminal · row kept for export)' })
  @ApiResponse(
    apiEnvelopeShape(TenantApplicationResponse, { description: 'Tenant marked deleted.' }),
  )
  @ApiResponse(apiError(404, 'Tenant not found.'))
  @ApiResponse(apiError(409, 'Already deleted (illegal transition).'))
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      DeleteTenantCommand,
      TenantApplicationReadModel | null
    >(new DeleteTenantCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', { errorCode: ERROR_CODES.TENANCY_NOT_FOUND });
    return result;
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantHardDeleteResultSchema })
  @ApiOperation({
    summary:
      'Hard-delete a deleted-terminal tenant (irreversible · FK cascade + event purge · NFR-6)',
  })
  @ApiResponse(
    apiEnvelopeShape(TenantHardDeleteResultResponse, {
      description: 'Tenant rows purged; payload carries purgedEvents for audit核对.',
    }),
  )
  @ApiResponse(apiError(404, 'Tenant not found (or already hard-deleted · idempotent).'))
  @ApiResponse(apiError(409, 'Not in deleted terminal state — soft-delete first.'))
  async permanentRemove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantHardDeleteResult> {
    const result = await this.commandBus.execute<
      DeleteTenantPermanentlyCommand,
      TenantHardDeleteResult | null
    >(new DeleteTenantPermanentlyCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', { errorCode: ERROR_CODES.TENANCY_NOT_FOUND });
    return result;
  }
}

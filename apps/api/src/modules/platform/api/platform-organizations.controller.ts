import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { DeleteOrganizationCommand } from '@app/modules/organizations/application/commands/delete-organization.command';
import {
  DeleteOrganizationPermanentlyCommand,
  type OrganizationHardDeleteResult,
} from '@app/modules/organizations/application/commands/delete-organization-permanently.command';
import { ResumeOrganizationCommand } from '@app/modules/organizations/application/commands/resume-organization.command';
import { SuspendOrganizationCommand } from '@app/modules/organizations/application/commands/suspend-organization.command';
import { ExportOrganizationDataQuery } from '@app/modules/organizations/application/queries/export-organization-data.query';
import { GetOrganizationDiagnosticsQuery } from '@app/modules/organizations/application/queries/get-organization-diagnostics.query';
import { GetPlatformOrganizationQuery } from '@app/modules/organizations/application/queries/get-platform-organization.query';
import { ListPlatformOrganizationsQuery } from '@app/modules/organizations/application/queries/list-platform-organizations.query';
import type { OrganizationApplicationReadModel } from '@app/modules/organizations/application/read-models/organization-application.read-model';
import type { OrganizationDataExport } from '@app/modules/organizations/application/read-models/organization-data-export.read-model';
import type {
  OrganizationDiagnostics,
  PlatformOrganizationPage,
  PlatformOrganizationRow,
} from '@app/modules/organizations/application/read-models/platform-organization.read-model';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
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
  type ListPlatformOrganizationsQuery as ListPlatformOrganizationsQueryDto,
  listPlatformOrganizationsQuerySchema,
  organizationApplicationViewSchema,
  organizationDiagnosticsSchema,
  organizationHardDeleteResultSchema,
  platformOrganizationPageSchema,
  platformOrganizationRowSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
  apiOkPassthrough,
} from '../../../common/contracts/api-contracts';
import { OrganizationApplicationResponse } from '../../organizations/api/response/organization-application.response';
import {
  OrganizationDiagnosticsResponse,
  OrganizationHardDeleteResultResponse,
  PlatformOrganizationPageResponse,
  PlatformOrganizationRowResponse,
} from './response/governance.response';

/**
 * Platform operator governance slice (global-tenancy S5 · FR-6/FR-11①/FR-13).
 *
 * Every route is gated by `PlatformOperatorGuard` (the sole cross-tenant authority —
 * the unique platform operator, DB email matches `platform.operatorEmail`, fail-closed).
 * These handlers read/write WITHOUT a tenant scope on purpose: platform-level governance
 * spans all tenants (FR-11①), so they deliberately never bind TenantIsolationGuard.
 *
 * Lifecycle transitions route through `OrganizationStatusService.transition` (single choke-point on
 * the `tenant.status` column, §9.4 state machine): suspend (active→suspended), resume (suspended→active),
 * delete (soft→deleted terminal). Each success/failure emits a structured audit line (FR-6).
 */
@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  PlatformOrganizationPageResponse,
  PlatformOrganizationRowResponse,
  OrganizationDiagnosticsResponse,
  OrganizationHardDeleteResultResponse,
  OrganizationApplicationResponse,
)
@ApiTags('platform')
// S11 复合全局：跨租平台治理（列表/详情/诊断/suspend·resume·delete）无关单一租户上下文 → 类级豁免租户墙。
@TenantIsolationExempt()
@Controller('platform/organizations')
@UseGuards(PlatformOperatorGuard)
export class PlatformOrganizationsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @SerializeOptions({ schema: platformOrganizationPageSchema })
  @ApiOperation({ summary: 'List all organizations across the platform (operator only)' })
  @ApiResponse(
    apiEnvelopeShape(PlatformOrganizationPageResponse, {
      description: 'A page of organizations with lifecycle status.',
    }),
  )
  @ApiResponse(apiError(403, 'Not the platform operator.'))
  list(
    @Query({ schema: listPlatformOrganizationsQuerySchema }) dto: ListPlatformOrganizationsQueryDto,
  ): Promise<PlatformOrganizationPage> {
    return this.queryBus.execute<ListPlatformOrganizationsQuery, PlatformOrganizationPage>(
      new ListPlatformOrganizationsQuery(dto.limit, dto.offset, dto.search),
    );
  }

  @Get(':id')
  @SerializeOptions({ schema: platformOrganizationRowSchema })
  @ApiOperation({ summary: 'Get one organization (operator only)' })
  @ApiResponse(
    apiEnvelopeShape(PlatformOrganizationRowResponse, { description: 'Organization row.' }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  async detail(@Param('id') id: string): Promise<PlatformOrganizationRow> {
    const row = await this.queryBus.execute<
      GetPlatformOrganizationQuery,
      PlatformOrganizationRow | null
    >(new GetPlatformOrganizationQuery(id));
    if (!row)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return row;
  }

  @Get(':id/diagnostics')
  @SerializeOptions({ schema: organizationDiagnosticsSchema })
  @ApiOperation({
    summary: 'Per-organization diagnostics: member/invitation/workspace/post counts',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationDiagnosticsResponse, { description: 'Diagnostics bundle.' }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  async diagnostics(@Param('id') id: string): Promise<OrganizationDiagnostics> {
    const diag = await this.queryBus.execute<
      GetOrganizationDiagnosticsQuery,
      OrganizationDiagnostics | null
    >(new GetOrganizationDiagnosticsQuery(id));
    if (!diag)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return diag;
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export all organization-owned data as a single JSON payload (NFR-6)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Six-section organization data export (credentials excluded)',
      ssotHint: 'OrganizationDataExport（bulk-export·六段聚合）',
    }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  async exportData(@Param('id') id: string): Promise<OrganizationDataExport> {
    const payload = await this.queryBus.execute<
      ExportOrganizationDataQuery,
      OrganizationDataExport | null
    >(new ExportOrganizationDataQuery(id));
    if (!payload)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return payload;
  }

  @Patch(':id/suspend')
  @SerializeOptions({ schema: organizationApplicationViewSchema })
  @ApiOperation({
    summary: 'Suspend an active organization (active → suspended · fail-closed失能)',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationApplicationResponse, { description: 'Organization suspended.' }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async suspend(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<OrganizationApplicationReadModel> {
    const result = await this.commandBus.execute<
      SuspendOrganizationCommand,
      OrganizationApplicationReadModel | null
    >(new SuspendOrganizationCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  @Patch(':id/resume')
  @SerializeOptions({ schema: organizationApplicationViewSchema })
  @ApiOperation({ summary: 'Resume a suspended organization (suspended → active)' })
  @ApiResponse(
    apiEnvelopeShape(OrganizationApplicationResponse, { description: 'Organization resumed.' }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<OrganizationApplicationReadModel> {
    const result = await this.commandBus.execute<
      ResumeOrganizationCommand,
      OrganizationApplicationReadModel | null
    >(new ResumeOrganizationCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: organizationApplicationViewSchema })
  @ApiOperation({
    summary: 'Soft-delete an organization (→ deleted terminal · row kept for export)',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationApplicationResponse, {
      description: 'Organization marked deleted.',
    }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  @ApiResponse(apiError(409, 'Already deleted (illegal transition).'))
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<OrganizationApplicationReadModel> {
    const result = await this.commandBus.execute<
      DeleteOrganizationCommand,
      OrganizationApplicationReadModel | null
    >(new DeleteOrganizationCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: organizationHardDeleteResultSchema })
  @ApiOperation({
    summary:
      'Hard-delete a deleted-terminal organization (irreversible · FK cascade + event purge · NFR-6)',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationHardDeleteResultResponse, {
      description: 'Organization rows purged; payload carries purgedEvents for audit核对.',
    }),
  )
  @ApiResponse(apiError(404, 'Organization not found (or already hard-deleted · idempotent).'))
  @ApiResponse(apiError(409, 'Not in deleted terminal state — soft-delete first.'))
  async permanentRemove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<OrganizationHardDeleteResult> {
    const result = await this.commandBus.execute<
      DeleteOrganizationPermanentlyCommand,
      OrganizationHardDeleteResult | null
    >(new DeleteOrganizationPermanentlyCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }
}

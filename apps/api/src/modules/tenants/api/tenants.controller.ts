import { CurrentUser } from '@app/modules/auth/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/guards/session.guard';
import { SessionGuard } from '@app/modules/auth/guards/session.guard';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantExempt } from '@core/saas-kit/tenancy/tenant-exempt.decorator';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { CommandBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type CreateTenantApplication,
  createTenantApplicationSchema,
  tenantApplicationViewSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { ApproveTenantCommand } from '../application/commands/approve-tenant.command';
import { RejectTenantCommand } from '../application/commands/reject-tenant.command';
import { SubmitTenantApplicationCommand } from '../application/commands/submit-tenant-application.command';
import type { TenantApplicationReadModel } from '../application/read-models/tenant-application.read-model';
import { TenantApplicationResponse } from './response/tenant-application.response';

/**
 * Tenant application / approval reference slice (global-tenancy S4 · FR-1/FR-11/FR-12).
 *
 * FR-11 three-layer separation is expressed by the guard chosen PER ROUTE — none of these
 * is tenant-scoped (you have no active tenant while applying; approval is cross-tenant):
 * - `POST /tenants/applications`         → user-level (SessionGuard): authenticated user applies.
 * - `POST /tenants/applications/:id/approve|reject` → platform-level (PlatformOperatorGuard).
 *
 * Applying creates a `pending_approval` organization (self-service instant provisioning is
 * closed at the BA layer — `allowUserToCreateOrganization:false`); the applicant becomes the
 * first `owner` via BA (FR-12). A pending tenant binds no tenant context, so its business
 * routes fail closed until an operator approves it (S4 middleware deny-list).
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, TenantApplicationResponse)
@ApiTags('tenants')
// S11 复合全局：建租申请（此刻无 active 租·鸡生蛋）+ approve/reject（跨租平台治理）皆合法无租户 → 类级豁免租户墙。
@TenantExempt()
@Controller('tenants')
export class TenantsController {
  constructor(@Inject(CommandBus) private readonly commandBus: CommandBus) {}

  @Post('applications')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  @SerializeOptions({ schema: tenantApplicationViewSchema })
  @ApiOperation({ summary: 'Apply to create a tenant (user-level · lands pending_approval)' })
  @ApiResponse(
    apiEnvelopeShape(TenantApplicationResponse, {
      status: 201,
      description: 'Pending tenant created; inactive until approved.',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  apply(
    @CurrentUser() user: SessionUser,
    @Body({ schema: createTenantApplicationSchema }) dto: CreateTenantApplication,
  ): Promise<TenantApplicationReadModel> {
    return this.commandBus.execute<SubmitTenantApplicationCommand, TenantApplicationReadModel>(
      new SubmitTenantApplicationCommand(user.id, dto.name, dto.slug),
    );
  }

  @Post('applications/:id/approve')
  @UseGuards(PlatformOperatorGuard)
  @SerializeOptions({ schema: tenantApplicationViewSchema })
  @ApiOperation({ summary: 'Approve a pending tenant (platform operator · pending → active)' })
  @ApiResponse(apiEnvelopeShape(TenantApplicationResponse, { description: 'Tenant activated.' }))
  @ApiResponse(apiError(403, 'Not a platform operator.'))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      ApproveTenantCommand,
      TenantApplicationReadModel | null
    >(new ApproveTenantCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Tenant application not found', {
        errorCode: ERROR_CODES.TENANCY_APPLICATION_NOT_FOUND,
      });
    return result;
  }

  @Post('applications/:id/reject')
  @UseGuards(PlatformOperatorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject a pending tenant (platform operator · hard-delete)' })
  @ApiResponse({ status: 204, description: 'Pending tenant discarded.' })
  @ApiResponse(apiError(403, 'Not a platform operator.'))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  async reject(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<void> {
    const removed = await this.commandBus.execute<RejectTenantCommand, boolean>(
      new RejectTenantCommand(id, user.id),
    );
    if (!removed)
      throw new NotFoundException('Tenant application not found', {
        errorCode: ERROR_CODES.TENANCY_APPLICATION_NOT_FOUND,
      });
  }
}

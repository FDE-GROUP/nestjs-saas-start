import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
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
  type CreateOrganizationApplication,
  createOrganizationApplicationSchema,
  organizationApplicationViewSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { ApproveOrganizationCommand } from '../application/commands/approve-organization.command';
import { RejectOrganizationCommand } from '../application/commands/reject-organization.command';
import { SubmitOrganizationApplicationCommand } from '../application/commands/submit-organization-application.command';
import type { OrganizationApplicationReadModel } from '../application/read-models/organization-application.read-model';
import { mapBaError } from './ba-error.mapping';
import { OrganizationApplicationResponse } from './response/organization-application.response';

/**
 * Organization application / approval reference slice (global-tenancy S4 · FR-1/FR-11/FR-12).
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
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, OrganizationApplicationResponse)
@ApiTags('organizations')
// S11 复合全局：建租申请（此刻无 active 租·鸡生蛋）+ approve/reject（跨租平台治理）皆合法无租户 → 类级豁免租户墙。
@TenantIsolationExempt()
@Controller('organizations')
export class OrganizationsController {
  constructor(@Inject(CommandBus) private readonly commandBus: CommandBus) {}

  @Post('applications')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  @SerializeOptions({ schema: organizationApplicationViewSchema })
  @ApiOperation({
    summary: 'Apply to create an organization (user-level · lands pending_approval)',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationApplicationResponse, {
      status: 201,
      description: 'Pending organization created; inactive until approved.',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(400, 'Organization slug already exists (BA duplicate).'))
  async apply(
    @CurrentUser() user: SessionUser,
    @Body({ schema: createOrganizationApplicationSchema }) dto: CreateOrganizationApplication,
  ): Promise<OrganizationApplicationReadModel> {
    // 建租经 BA `createOrganization` 服务端系统动作：重复 slug 等 4xx `APIError` 走门面统一出口
    // `mapBaError` 归一透传状态（避免逃逸为 500·对齐 epic-02 §2.1·module-rbac-casl §2.3.1）。
    try {
      return await this.commandBus.execute<
        SubmitOrganizationApplicationCommand,
        OrganizationApplicationReadModel
      >(new SubmitOrganizationApplicationCommand(user.id, dto.name, dto.slug));
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('applications/:id/approve')
  // 激活既有 pending 租户（非新建资源）·运行时对齐 OpenAPI 文档 200（REST 一致性核验片·项③）。
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformOperatorGuard)
  @SerializeOptions({ schema: organizationApplicationViewSchema })
  @ApiOperation({
    summary: 'Approve a pending organization (platform operator · pending → active)',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationApplicationResponse, { description: 'Organization activated.' }),
  )
  @ApiResponse(apiError(403, 'Not a platform operator.'))
  @ApiResponse(apiError(404, 'Organization not found.'))
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<OrganizationApplicationReadModel> {
    const result = await this.commandBus.execute<
      ApproveOrganizationCommand,
      OrganizationApplicationReadModel | null
    >(new ApproveOrganizationCommand(id, user.id));
    if (!result)
      throw new NotFoundException('Organization application not found', {
        errorCode: ERROR_CODES.ORG_PROVISIONING_NOT_FOUND,
      });
    return result;
  }

  @Post('applications/:id/reject')
  @UseGuards(PlatformOperatorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject a pending organization (platform operator · hard-delete)' })
  @ApiResponse({ status: 204, description: 'Pending organization discarded.' })
  @ApiResponse(apiError(403, 'Not a platform operator.'))
  @ApiResponse(apiError(404, 'Organization not found.'))
  async reject(@Param('id') id: string, @CurrentUser() user: SessionUser): Promise<void> {
    const removed = await this.commandBus.execute<RejectOrganizationCommand, boolean>(
      new RejectOrganizationCommand(id, user.id),
    );
    if (!removed)
      throw new NotFoundException('Organization application not found', {
        errorCode: ERROR_CODES.ORG_PROVISIONING_NOT_FOUND,
      });
  }
}

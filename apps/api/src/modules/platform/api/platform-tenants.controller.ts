import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { DeleteOrganizationCommand } from '@app/modules/organizations/application/commands/delete-organization.command';
import { DeleteOrganizationPermanentlyCommand } from '@app/modules/organizations/application/commands/delete-organization-permanently.command';
import { ResumeOrganizationCommand } from '@app/modules/organizations/application/commands/resume-organization.command';
import { SetTenantOrgVisibilityCommand } from '@app/modules/organizations/application/commands/set-tenant-org-visibility.command';
import { SuspendOrganizationCommand } from '@app/modules/organizations/application/commands/suspend-organization.command';
import { ExportOrganizationDataQuery } from '@app/modules/organizations/application/queries/export-organization-data.query';
import { GetOrganizationDiagnosticsQuery } from '@app/modules/organizations/application/queries/get-organization-diagnostics.query';
import { GetPlatformTenantQuery } from '@app/modules/organizations/application/queries/get-platform-tenant.query';
import { ListPlatformTenantsQuery } from '@app/modules/organizations/application/queries/list-platform-tenants.query';
import type { OrganizationDataExport } from '@app/modules/organizations/application/read-models/organization-data-export.read-model';
import type {
  OrganizationDiagnostics,
  PlatformTenantDetail,
  PlatformTenantPage,
} from '@app/modules/organizations/application/read-models/platform-tenant.read-model';
import type {
  TenantGovernanceResult,
  TenantHardDeleteResult,
  TenantOrgVisibilityResult,
} from '@app/modules/organizations/application/read-models/tenant-governance.read-model';
import type { OrgVisibility } from '@core/saas-kit/modules/organizations/visibility/org-visibility';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
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
  Query,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type ListPlatformTenantsQuery as ListPlatformTenantsQueryDto,
  listPlatformTenantsQuerySchema,
  organizationDiagnosticsSchema,
  platformTenantDetailSchema,
  platformTenantPageSchema,
  type SetTenantOrgVisibility,
  setTenantOrgVisibilitySchema,
  tenantGovernanceResultSchema,
  tenantHardDeleteResultSchema,
  tenantOrgVisibilityResultSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
  apiOkPassthrough,
} from '../../../common/contracts/api-contracts';
import {
  OrganizationDiagnosticsResponse,
  PlatformTenantDetailResponse,
  PlatformTenantPageResponse,
  TenantGovernanceResultResponse,
  TenantHardDeleteResultResponse,
  TenantOrgVisibilityResultResponse,
} from './response/governance.response';

/**
 * 平台操作员治理切片的 HTTP 控制器（多租户 S5 · FR-6/FR-11①/FR-13）。
 *
 * @remarks
 * Platform operator governance slice (global-tenancy S5 · FR-6/FR-11①/FR-13).
 *
 * Every route is gated by `PlatformOperatorGuard` (the sole cross-tenant authority —
 * the unique platform operator, DB email matches `platform.operatorEmail`, fail-closed).
 * These handlers read/write WITHOUT a tenant scope on purpose: platform-level governance
 * spans all tenants (FR-11①), so they deliberately never bind TenantIsolationGuard.
 *
 * rehierarchy 片一（治理台改锚 tenant·准入态归位）：治理台全线以 **tenant 主键**为锚——审批准入态权威单点住
 * `tenant.status`，经 `TenantStatusService.transition(tenantId, …)`（§9.4 迁移表）裁决 suspend（active→suspended）、
 * resume（suspended→active）、delete（软→deleted 终态）；硬删租户连带清除其名下**所有组织**及子表（不可逆·FK cascade）。
 * 组织降级为租户名册下的下钻/绑定面：诊断/导出/ Odoo 绑定仍 org 级（一组织一公司），经租户详情路径抵达。
 * 每次成功/失败均落结构化审计行（FR-6）。
 * @public
 */
@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  PlatformTenantPageResponse,
  PlatformTenantDetailResponse,
  OrganizationDiagnosticsResponse,
  TenantGovernanceResultResponse,
  TenantHardDeleteResultResponse,
  TenantOrgVisibilityResultResponse,
)
@ApiTags('platform')
// S11 复合全局：跨租平台治理（列表/详情/诊断/suspend·resume·delete）无关单一租户上下文 → 类级豁免租户墙。
@TenantIsolationExempt()
@Controller('platform/tenants')
@UseGuards(PlatformOperatorGuard)
export class PlatformTenantsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 跨平台列出所有租户（仅操作员·offset 分页·每行携名下组织计数）。
   * @param dto - 分页与搜索请求。
   * @returns 带准入态的租户分页页。
   */
  @Get()
  @SerializeOptions({ schema: platformTenantPageSchema })
  @ApiOperation({ summary: 'List all tenants across the platform (operator only)' })
  @ApiResponse(
    apiEnvelopeShape(PlatformTenantPageResponse, {
      description: 'A page of tenants with admission status and org counts.',
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

  /**
   * 取单个租户详情（仅操作员·tenant 基本盘 + 名下组织名册）。
   * @param tenantId - 租户主键。
   * @returns 租户详情；未命中抛 404。
   *
   * @throws {NotFoundException} 租户不存在时。
   */
  @Get(':tenantId')
  @SerializeOptions({ schema: platformTenantDetailSchema })
  @ApiOperation({ summary: 'Get one tenant with its organization roster (operator only)' })
  @ApiResponse(apiEnvelopeShape(PlatformTenantDetailResponse, { description: 'Tenant detail.' }))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  async detail(@Param('tenantId') tenantId: string): Promise<PlatformTenantDetail> {
    const detail = await this.queryBus.execute<GetPlatformTenantQuery, PlatformTenantDetail | null>(
      new GetPlatformTenantQuery(tenantId),
    );
    if (!detail)
      throw new NotFoundException('Tenant not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return detail;
  }

  /**
   * 暂停生效租户（active→suspended·封禁整个租户·fail-closed 失能）。
   * @param tenantId - 租户主键。
   * @param user - 当前操作员会话。
   * @returns 迁移后租户治理回执；未命中 404、非法转移 409。
   *
   * @throws {NotFoundException} 租户不存在时。
   */
  @Patch(':tenantId/suspend')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantGovernanceResultSchema })
  @ApiOperation({
    summary: 'Suspend an active tenant (active → suspended · blocks the whole tenant)',
  })
  @ApiResponse(
    apiEnvelopeShape(TenantGovernanceResultResponse, { description: 'Tenant suspended.' }),
  )
  @ApiResponse(apiError(404, 'Tenant not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async suspend(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantGovernanceResult> {
    const result = await this.commandBus.execute<
      SuspendOrganizationCommand,
      TenantGovernanceResult | null
    >(new SuspendOrganizationCommand(tenantId, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  /**
   * 恢复已暂停租户（suspended→active）。
   * @param tenantId - 租户主键。
   * @param user - 当前操作员会话。
   * @returns 迁移后租户治理回执；未命中 404、非法转移 409。
   *
   * @throws {NotFoundException} 租户不存在时。
   */
  @Patch(':tenantId/resume')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantGovernanceResultSchema })
  @ApiOperation({ summary: 'Resume a suspended tenant (suspended → active)' })
  @ApiResponse(apiEnvelopeShape(TenantGovernanceResultResponse, { description: 'Tenant resumed.' }))
  @ApiResponse(apiError(404, 'Tenant not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async resume(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantGovernanceResult> {
    const result = await this.commandBus.execute<
      ResumeOrganizationCommand,
      TenantGovernanceResult | null
    >(new ResumeOrganizationCommand(tenantId, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  /**
   * 设置该租户租内跨组织可见性策略（第三次复裁切片 3·D2·`platform` 治理面）。
   * @param tenantId - 租户主键。
   * @param dto - 目标可见性策略（shared/isolated）。
   * @param user - 当前操作员会话。
   * @returns 设置后的租户可见性回执；未命中 404。
   *
   * @throws {NotFoundException} 租户不存在时。
   */
  @Patch(':tenantId/visibility')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantOrgVisibilityResultSchema })
  @ApiOperation({
    summary: "Set the tenant's intra-tenant organization visibility policy (shared ⇄ isolated)",
  })
  @ApiResponse(
    apiEnvelopeShape(TenantOrgVisibilityResultResponse, {
      description: 'Tenant orgVisibility updated (shared=互见 · isolated=租内跨组织互不可见).',
    }),
  )
  @ApiResponse(apiError(404, 'Tenant not found.'))
  async setVisibility(
    @Param('tenantId') tenantId: string,
    @Body({ schema: setTenantOrgVisibilitySchema }) dto: SetTenantOrgVisibility,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantOrgVisibilityResult> {
    const result = await this.commandBus.execute<
      SetTenantOrgVisibilityCommand,
      TenantOrgVisibilityResult | null
    >(new SetTenantOrgVisibilityCommand(tenantId, dto.orgVisibility as OrgVisibility, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  /**
   * 软删租户（→deleted 终态·封禁整个租户·行保留供导出）。
   * @param tenantId - 租户主键。
   * @param user - 当前操作员会话。
   * @returns 迁移后租户治理回执；未命中 404、已删 409。
   *
   * @throws {NotFoundException} 租户不存在时。
   */
  @Delete(':tenantId')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantGovernanceResultSchema })
  @ApiOperation({
    summary:
      'Soft-delete a tenant (→ deleted terminal · blocks the whole tenant · row kept for export)',
  })
  @ApiResponse(
    apiEnvelopeShape(TenantGovernanceResultResponse, {
      description: 'Tenant marked deleted.',
    }),
  )
  @ApiResponse(apiError(404, 'Tenant not found.'))
  @ApiResponse(apiError(409, 'Already deleted (illegal transition).'))
  async remove(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantGovernanceResult> {
    const result = await this.commandBus.execute<
      DeleteOrganizationCommand,
      TenantGovernanceResult | null
    >(new DeleteOrganizationCommand(tenantId, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  /**
   * 硬删已处 deleted 终态的租户（不可逆·连带清除名下所有组织及子表 + 事件清除·NFR-6）。
   * @param tenantId - 租户主键。
   * @param user - 当前操作员会话。
   * @returns 含 purgedOrgs/purgedEvents 的硬删结果；未命中/幂等 404、非终态 409。
   *
   * @throws {NotFoundException} 租户不存在时。
   */
  @Delete(':tenantId/permanent')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantHardDeleteResultSchema })
  @ApiOperation({
    summary:
      'Hard-delete a deleted-terminal tenant (irreversible · cascade purge of all its orgs + event purge · NFR-6)',
  })
  @ApiResponse(
    apiEnvelopeShape(TenantHardDeleteResultResponse, {
      description: 'Tenant rows purged; payload carries purgedOrgs/purgedEvents for audit核对.',
    }),
  )
  @ApiResponse(apiError(404, 'Tenant not found (or already hard-deleted · idempotent).'))
  @ApiResponse(apiError(409, 'Not in deleted terminal state — soft-delete first.'))
  async permanentRemove(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantHardDeleteResult> {
    const result = await this.commandBus.execute<
      DeleteOrganizationPermanentlyCommand,
      TenantHardDeleteResult | null
    >(new DeleteOrganizationPermanentlyCommand(tenantId, user.id));
    if (!result)
      throw new NotFoundException('Tenant not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return result;
  }

  /**
   * 组织级诊断下钻：成员/邀请/工作区/帖子计数（经租户详情抵达）。
   * @param orgId - 组织主键（租户路径下钻·一组织一公司）。
   * @returns 诊断包；未命中抛 404。
   *
   * @throws {NotFoundException} 组织不存在时。
   */
  @Get(':tenantId/organizations/:orgId/diagnostics')
  @SerializeOptions({ schema: organizationDiagnosticsSchema })
  @ApiOperation({
    summary: 'Per-organization diagnostics: member/invitation/workspace/post counts (drill-down)',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationDiagnosticsResponse, { description: 'Diagnostics bundle.' }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  async diagnostics(
    @Param('tenantId') _tenantId: string,
    @Param('orgId') orgId: string,
  ): Promise<OrganizationDiagnostics> {
    const diag = await this.queryBus.execute<
      GetOrganizationDiagnosticsQuery,
      OrganizationDiagnostics | null
    >(new GetOrganizationDiagnosticsQuery(orgId));
    if (!diag)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return diag;
  }

  /**
   * 导出该组织全部数据为单一 JSON（NFR-6·不含凭证·经租户详情下钻）。
   * @param orgId - 组织主键（租户路径下钻）。
   * @returns 六段聚合导出；未命中抛 404。
   *
   * @throws {NotFoundException} 组织不存在时。
   */
  @Get(':tenantId/organizations/:orgId/export')
  @ApiOperation({
    summary: 'Export all organization-owned data as a single JSON payload (NFR-6 · drill-down)',
  })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Six-section organization data export (credentials excluded)',
      ssotHint: 'OrganizationDataExport（bulk-export·六段聚合）',
    }),
  )
  @ApiResponse(apiError(404, 'Organization not found.'))
  async exportData(
    @Param('tenantId') _tenantId: string,
    @Param('orgId') orgId: string,
  ): Promise<OrganizationDataExport> {
    const payload = await this.queryBus.execute<
      ExportOrganizationDataQuery,
      OrganizationDataExport | null
    >(new ExportOrganizationDataQuery(orgId));
    if (!payload)
      throw new NotFoundException('Organization not found', {
        errorCode: ERROR_CODES.ORG_NOT_FOUND,
      });
    return payload;
  }
}

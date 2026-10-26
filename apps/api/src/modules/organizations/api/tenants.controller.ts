import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import { Controller, Get, Inject, SerializeOptions, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type TenantDirectoryView, tenantDirectoryViewSchema } from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import {
  TENANT_DIRECTORY_REPOSITORY,
  type TenantDirectoryRepository,
} from '../domain/repositories/tenant-directory.repository';
import { TenantDirectoryResponse } from './response/tenant-directory.response';

/**
 * 租户目录端点（global-tenant-organization-rehierarchy 切片 E-F·FR-11 用户级读面）。
 *
 * @remarks
 * 列当前用户可见的租户（顶层）及其下组织（二级），供前端双层切换器。**跨租可见**（成员资格归组·
 * 此刻尚无单一 active 租户可言），故类级 `@TenantIsolationExempt()` 旁路租户墙、逐路由 `SessionGuard`
 * 保会话必需；可见面由仓储以 `userId` 收敛（成员资格归属），非独立隔离闸。**只读**——审批/切换仍走
 * `organizations` 准入面（saga 已随换轴归位租户态），本面不重复其写职责。
 * @public
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, TenantDirectoryResponse)
@ApiTags('tenants')
@TenantIsolationExempt()
@Controller('tenants')
export class TenantsController {
  constructor(
    @Inject(TENANT_DIRECTORY_REPOSITORY) private readonly directory: TenantDirectoryRepository,
  ) {}

  /**
   * 列当前用户可见的租户目录（每租携其下组织集合）。
   * @param user - 会话用户（成员资格收敛输入）。
   * @returns 归组后的租户目录视图。
   */
  @Get()
  @UseGuards(SessionGuard)
  @SerializeOptions({ schema: tenantDirectoryViewSchema })
  @ApiOperation({ summary: 'List tenant directory of the current user (tenants → organizations)' })
  @ApiResponse(
    apiEnvelopeShape(TenantDirectoryResponse, {
      description: 'Tenant directory grouped by the current user memberships.',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  async list(@CurrentUser() user: SessionUser): Promise<TenantDirectoryView> {
    const tenants = await this.directory.listForUser(user.id);
    return { tenants };
  }
}

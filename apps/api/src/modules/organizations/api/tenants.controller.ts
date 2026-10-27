import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  SerializeOptions,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type ActiveTenantResult,
  activeTenantResultSchema,
  type SetActiveTenant,
  setActiveTenantSchema,
  type TenantDirectoryView,
  tenantDirectoryViewSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { SetSessionActiveTenantCommand } from '../application/commands/set-session-active-tenant.command';
import {
  TENANT_DIRECTORY_REPOSITORY,
  type TenantDirectoryRepository,
} from '../domain/repositories/tenant-directory.repository';
import {
  ActiveTenantResponse,
  TenantDirectoryResponse,
} from './response/tenant-directory.response';

/**
 * 租户目录端点（global-tenant-organization-rehierarchy 切片 E-F·FR-11 用户级读面）。
 *
 * @remarks
 * 列当前用户可见的租户（顶层）及其下组织（二级），供前端双层切换器。**跨租可见**（成员资格归组·
 * 此刻尚无单一 active 租户可言），故类级 `@TenantIsolationExempt()` 旁路租户墙、逐路由 `SessionGuard`
 * 保会话必需；可见面由仓储以 `userId` 收敛（成员资格归属），非独立隔离闸。**只读**——审批/切换仍走
 * `organizations` 准入面（saga 已随换轴归位租户态），本面不重复其写职责。**例外（切片 4·D7）**：新增
 * `PUT /tenants/active`——它不写租户生命周期态，只写当前会话的租级激活位（session-scoped）。
 * @public
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, TenantDirectoryResponse, ActiveTenantResponse)
@ApiTags('tenants')
@TenantIsolationExempt()
@Controller('tenants')
export class TenantsController {
  constructor(
    @Inject(TENANT_DIRECTORY_REPOSITORY) private readonly directory: TenantDirectoryRepository,
    private readonly commandBus: CommandBus,
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

  /**
   * 设置当前会话的活动租户（第三次层级复裁 切片 4·D7 租激活解绑）。
   *
   * @remarks
   * 选租**不依赖先选活动组织**：写入会话 `activeTenantId` 后，后续租级端点（计费/席位/目录）即可在无
   * 活动 org 下经中间件绑定租上下文抵达。handler 先校目标租成员资格（非成员 403·fail-closed），再经
   * 属主端口写会话真列。sessionId 由 SessionGuard 从已验签会话挂上；缺失 → 400。
   * @param user - 会话用户（携 sessionId·写坐标可信）。
   * @param dto - 目标 tenantId。
   * @returns 已激活租户回执；写行查无 → 401。
   */
  @Put('active')
  @UseGuards(SessionGuard)
  @SerializeOptions({ schema: activeTenantResultSchema })
  @ApiOperation({ summary: 'Set the active tenant of the current session (tenant activation)' })
  @ApiResponse(
    apiEnvelopeShape(ActiveTenantResponse, {
      description: 'The activated tenant id written to the session.',
    }),
  )
  @ApiResponse(apiError(400, 'Session id missing on the authenticated principal.'))
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(403, 'Not a member of the target tenant.'))
  async setActiveTenant(
    @CurrentUser() user: SessionUser,
    @Body({ schema: setActiveTenantSchema }) dto: SetActiveTenant,
  ): Promise<ActiveTenantResult> {
    if (!user.sessionId)
      throw new UnauthorizedException('Session id missing on the authenticated principal.');
    const result = await this.commandBus.execute<
      SetSessionActiveTenantCommand,
      ActiveTenantResult | null
    >(new SetSessionActiveTenantCommand(user.id, user.sessionId, dto.tenantId));
    if (!result) throw new UnauthorizedException('Session no longer valid.');
    return result;
  }
}

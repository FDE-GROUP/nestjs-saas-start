import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  AUTH_SESSION_STORE,
  type AuthSessionStore,
} from '@app/modules/auth/domain/ports/session-store.port';
import { canUseOdoo } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import {
  ORGANIZATION_ODOO_BINDING_READER,
  type OrganizationOdooBindingReader,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type InvitationId,
  invitationIdSchema,
  type LeaveOrganization,
  leaveOrganizationSchema,
  type OrganizationOdooAvailabilityView,
  organizationOdooAvailabilityViewSchema,
  type SetActiveOrganization,
  setActiveOrganizationSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
  apiOkPassthrough,
} from '../../../common/contracts/api-contracts';
import { TenantMemberFacadeService } from '../application/tenant-member-facade.service';
import { mapBaError } from './ba-error.mapping';
import { OrganizationOdooAvailabilityResponse } from './response/organization-odoo-availability.response';

/** BA org 个人通道窄类型（服务端 API·非 HTTP）。 */
interface OrganizationSelfApi {
  listOrganizations(p: { headers: Record<string, unknown> }): Promise<unknown>;
  setActiveOrganization(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  leaveOrganization(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
}

/**
 * 租户**个人通道门面**（module-rbac-casl §2.3.1·甲裁严格拆·self 侧）。
 *
 * @remarks
 * 与 `OrganizationsOrgAdminController`（管理门面）的分工：本控制器全部端点是「个人对自己成员资格/
 * 邀请的操作」——**合法无 active 租户也可达**（列表/接受邀请皆发生于入组前），故类级
 * `@TenantIsolationExempt()` 旁路租户墙、逐路由 `SessionGuard` 保会话必需；授权语义由 BA 数据面
 * 自身裁决（membership 归属、被邀请人=本人、last-owner 不可退等），CASL 不介入
 * （CASL 矩阵管的是「租户内管理职权」，见 admin 门面）。
 *
 * 数据操作 = BA `auth.api.*` 服务端直调（窄门面透传·BA 侧 hooks/校验照旧，含 seats 配额），
 * 不经被封堵的 BA 内置 org HTTP 面。
 * @public
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, OrganizationOdooAvailabilityResponse)
@ApiTags('organizations')
// 入组前/无租户态的合法个人操作（成员资格列表、接受/拒绝邀请）→ 类级豁免租户墙，登录仍必需。
@TenantIsolationExempt()
@Controller('organizations')
export class OrganizationsSelfController {
  constructor(
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(ORGANIZATION_ODOO_BINDING_READER)
    private readonly bindings: OrganizationOdooBindingReader,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
    @Inject(AUTH_SESSION_STORE) private readonly sessions: AuthSessionStore,
    private readonly facade: TenantMemberFacadeService,
  ) {}

  private ba(): OrganizationSelfApi {
    const auth = this.authInstance.get();
    if (!auth)
      throw new ForbiddenException('Auth instance not initialized', {
        errorCode: ERROR_CODES.AUTH_PROVIDER_UNAVAILABLE,
      });
    return auth.api as unknown as OrganizationSelfApi;
  }

  /**
   * 列出当前用户所属的租户（个人通道）。
   * @param headers - 透传给 BA 服务端调用的请求头。
   * @returns BA 成员资格组织列表。
   */
  @Get()
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'List organizations the current user belongs to (personal channel)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Membership organizations (data from Better Auth)',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  async listMyOrganizations(@Headers() headers: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.ba().listOrganizations({ headers });
    } catch (err) {
      return mapBaError(err);
    }
  }

  /**
   * 切换会话的 active 组织（须为其成员）。
   * @param headers - 透传 BA 的请求头。
   * @param dto - 目标组织 id 载荷。
   * @param user - 会话用户（携 sessionId·P0 X2 双激活位互斥写坐标）。
   * @returns BA 切换结果；非成员 403 经 `mapBaError` 归一。
   */
  @Post('active')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Switch the session's active organization (must be a member)" })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Session activated organization updated',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(403, 'Not a member of the target organization (BA).'))
  async setActive(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: setActiveOrganizationSchema }) dto: SetActiveOrganization,
    @CurrentUser() user: SessionUser,
  ): Promise<unknown> {
    try {
      const result = await this.ba().setActiveOrganization({ headers, body: dto });
      // P0 修复 X2（双激活位互斥）：BA 写完 activeOrganizationId 后清 activeTenantId（与 setActiveTenant
      // 反向成对），杜绝 `{activeTenantId=T1, activeOrganizationId=O2∈T2}` 混态→租内跨租借权。sessionId 缺
      // 位（旧会话）→ 跳过清位（仍有中间件读侧 org∈tenant 校验兜底）。
      if (user?.sessionId) {
        await this.sessions.clearActiveTenant(user.sessionId);
      }
      return result;
    } catch (err) {
      return mapBaError(err);
    }
  }

  /**
   * 自助退出租户（last-owner 不可退）。
   * @param headers - 透传 BA 的请求头。
   * @param dto - 目标租户 id 载荷。
   * @returns BA 退出结果；数据守卫拒经 `mapBaError` 归一。
   */
  @Post('members/leave')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave an organization (self-service · last-owner cannot leave)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Membership removed',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(400, 'Not a member / sole owner leaving the organization (BA data guard).'))
  async leave(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: leaveOrganizationSchema }) dto: LeaveOrganization,
  ): Promise<unknown> {
    try {
      return await this.ba().leaveOrganization({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  /**
   * 接受发给当前用户的邀请（X7 租级化：消费自有 `tenant_invitation`·非 BA passthrough）。
   * @param dto - 邀请 id 载荷。
   * @param user - 会话用户（受邀主体·邮箱匹配与入租落行依据）。
   * @returns 入租结果（目标租 + 授予角色）；无效/过期 404、非受邀人 403、席位超限 402（门面守卫）。
   */
  @Post('invitations/accept')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation addressed to the current user' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation accepted; tenant-level membership created',
      ssotHint: 'tenant_invitation + tenant_membership（自有租级表）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(403, 'Session email does not match the invitee (fail-closed).'))
  @ApiResponse(apiError(404, 'Pending invitation not found or expired.'))
  @ApiResponse(apiError(402, 'Seat quota exceeded (checked at accept time).'))
  async acceptInvitation(
    @Body({ schema: invitationIdSchema }) dto: InvitationId,
    @CurrentUser() user: SessionUser,
  ): Promise<{ tenantId: string; roleKey: string }> {
    return this.facade.acceptInvitation(dto.invitationId, {
      userId: user.id,
      email: user.email,
    });
  }

  /**
   * 拒绝发给当前用户的邀请（X7 租级化：自有 `tenant_invitation` pending → cancelled）。
   * @param dto - 邀请 id 载荷。
   * @param user - 会话用户（受邀邮箱锥定·fail-closed 他人不可代拒）。
   * @returns 空体（非 pending/邮箱不符 → 404）。
   */
  @Post('invitations/reject')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an invitation addressed to the current user' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation rejected',
      ssotHint: 'tenant_invitation（自有租级表）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(404, 'Invitation not found/expired/not the invitee.'))
  async rejectInvitation(
    @Body({ schema: invitationIdSchema }) dto: InvitationId,
    @CurrentUser() user: SessionUser,
  ): Promise<{ ok: true }> {
    await this.facade.rejectInvitation(dto.invitationId, user.email);
    return { ok: true };
  }

  /**
   * 列出发给当前用户的待处理邀请（X7 租级化：自有 `tenant_invitation`·跨租个人可见面）。
   * @param user - 会话用户（以 email 收敛可见面）。
   * @returns 租级邀请列表。
   */
  @Get('invitations/mine')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'List pending invitations addressed to the current user' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation list (tenant-level invitation SSOT)',
      ssotHint: 'tenant_invitation（自有租级表）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  async listMyInvitations(@CurrentUser() user: SessionUser): Promise<unknown> {
    return this.facade.listMyInvitations(user.email);
  }

  /**
   * 读当前活跃租户的 Odoo 可用性（apps 面板数据源·module-org-odoo-company-mapping 切片 D）。
   *
   * @remarks
   * 软读会话活跃租户（本路由随类级 `@TenantIsolationExempt`·无活跃 org 不 403 而返「不可用」——面板
   * 需在未入组/未选租户态也能渲染），命中则经 published reader 端口取绑定行喂 `canUseOdoo` 单源裁决
   * （与 SSO/RPC 门禁同口径·三点门禁不漂移）。**不**触 Odoo·只读 SaaS 侧绑定态。
   * @returns 可用性视图（available/绑定态/公司 id·缺席一律 false/null）。
   */
  @Get('odoo/availability')
  @UseGuards(SessionGuard)
  @SerializeOptions({ schema: organizationOdooAvailabilityViewSchema })
  @ApiOperation({
    summary: 'Read the active organization Odoo availability for the apps panel (personal channel)',
  })
  @ApiResponse(
    apiEnvelopeShape(OrganizationOdooAvailabilityResponse, {
      description: 'Odoo availability by binding status (single-source canUseOdoo verdict).',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  async odooAvailability(): Promise<OrganizationOdooAvailabilityView> {
    const organizationId = this.tenant.organizationId;
    if (!organizationId) return { available: false, odooBindingStatus: null, odooCompanyId: null };
    const row = await this.bindings.read(organizationId);
    if (!row) return { available: false, odooBindingStatus: null, odooCompanyId: null };
    return {
      available: canUseOdoo({
        status: row.organizationStatus,
        odooBindingStatus: row.odooBindingStatus,
        odooCompanyId: row.odooCompanyId,
      }),
      odooBindingStatus: row.odooBindingStatus,
      odooCompanyId: row.odooCompanyId,
    };
  }
}

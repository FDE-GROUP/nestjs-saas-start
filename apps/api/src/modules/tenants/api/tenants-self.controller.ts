import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantExempt } from '@core/saas-kit/tenancy/tenant-exempt.decorator';
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
  UseGuards,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type InvitationId,
  invitationIdSchema,
  type LeaveTenant,
  leaveTenantSchema,
  type SetActiveTenant,
  setActiveTenantSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiError,
  apiOkPassthrough,
} from '../../../common/contracts/api-contracts';
import { mapBaError } from './ba-error.mapping';

/**
 * 租户**个人通道门面**（module-rbac-casl §2.3.1·甲裁严格拆·self 侧）。
 *
 * 与 {@link TenantsOrgAdminController} 的分工：本控制器全部端点是「个人对自己成员资格/
 * 邀请的操作」——**合法无 active 租户也可达**（列表/接受邀请皆发生于入组前），故类级
 * `@TenantExempt()` 旁路租户墙、逐路由 `SessionGuard` 保会话必需；授权语义由 BA 数据面
 * 自身裁决（membership 归属、被邀请人=本人、last-owner 不可退等），CASL 不介入
 * （CASL 矩阵管的是「租户内管理职权」，见 admin 门面）。
 *
 * 数据操作 = BA `auth.api.*` 服务端直调（窄门面透传·BA 侧 hooks/校验照旧，含 seats 配额），
 * 不经被封堵的 BA 内置 org HTTP 面。
 */

/** BA org 个人通道窄类型（服务端 API·非 HTTP）。 */
interface TenantSelfApi {
  listOrganizations(p: { headers: Record<string, unknown> }): Promise<unknown>;
  setActiveOrganization(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  leaveOrganization(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  acceptInvitation(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  rejectInvitation(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  listUserInvitations(p: {
    headers: Record<string, unknown>;
    query?: { email?: string };
  }): Promise<unknown>;
}

@ApiExtraModels(ApiEnvelope, ApiErrorResponse)
@ApiTags('tenants')
// 入组前/无租户态的合法个人操作（成员资格列表、接受/拒绝邀请）→ 类级豁免租户墙，登录仍必需。
@TenantExempt()
@Controller('tenants')
export class TenantsSelfController {
  constructor(@Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance) {}

  private ba(): TenantSelfApi {
    const auth = this.authInstance.get();
    if (!auth)
      throw new ForbiddenException('Auth instance not initialized', {
        errorCode: ERROR_CODES.AUTH_PROVIDER_UNAVAILABLE,
      });
    return auth.api as unknown as TenantSelfApi;
  }

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
    @Body({ schema: setActiveTenantSchema }) dto: SetActiveTenant,
  ): Promise<unknown> {
    try {
      return await this.ba().setActiveOrganization({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('members/leave')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a tenant (self-service · last-owner cannot leave)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Membership removed',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(400, 'Not a member / sole owner leaving the tenant (BA data guard).'))
  async leave(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: leaveTenantSchema }) dto: LeaveTenant,
  ): Promise<unknown> {
    try {
      return await this.ba().leaveOrganization({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('invitations/accept')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation addressed to the current user' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation accepted; membership created',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(
    apiError(400, 'Invitation not found/expired/not the invitee/seat cap (BA guards + hooks).'),
  )
  async acceptInvitation(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: invitationIdSchema }) dto: InvitationId,
  ): Promise<unknown> {
    try {
      return await this.ba().acceptInvitation({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('invitations/reject')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an invitation addressed to the current user' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation rejected',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  @ApiResponse(apiError(400, 'Invitation not found/expired/not the invitee (BA).'))
  async rejectInvitation(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: invitationIdSchema }) dto: InvitationId,
  ): Promise<unknown> {
    try {
      return await this.ba().rejectInvitation({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Get('invitations/mine')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'List pending invitations addressed to the current user' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation list (data from Better Auth)',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  async listMyInvitations(
    @Headers() headers: Record<string, unknown>,
    @CurrentUser() user: SessionUser,
  ): Promise<unknown> {
    try {
      // 服务端直调专属 query.email（BA 源码注记 server-side only）——以会话用户收敛可见面。
      return await this.ba().listUserInvitations({ headers, query: { email: user.email } });
    } catch (err) {
      return mapBaError(err);
    }
  }
}

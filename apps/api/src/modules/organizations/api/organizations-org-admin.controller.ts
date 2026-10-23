import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  ROLE_ASSIGNABILITY_READER,
  type RoleAssignabilityReader,
} from '@app/modules/authorization/domain/ports/role-assignability.port';
import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import {
  BadRequestException,
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
  type CreateInvitation,
  createInvitationSchema,
  type InvitationId,
  invitationIdSchema,
  type RemoveMember,
  removeMemberSchema,
  type UpdateMemberRole,
  updateMemberRoleSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiError,
  apiOkPassthrough,
} from '../../../common/contracts/api-contracts';
import { mapBaError } from './ba-error.mapping';

/**
 * 租户成员/邀请**管理门面**（module-rbac-casl §2.3.1·甲裁严格拆）。
 *
 * 新宪落点：授权裁决 = `@Can` + CASL（authorization-rules 单源·经 AuthorizationGuard 判定），
 * 数据操作 = BA `auth.api.*` **服务端直调**（认证·membership 数据域，不经被封堵的
 * BA 内置 org HTTP 面）。BA 服务端调用仍过其 membership/数据校验与 seats 配额 hook——
 * 门面是「授权在我、数据在 BA」的收口点，不是重实现。
 *
 * 租户作用域路由：不豁免（S11 全局墙 fail-closed），guard 组合沿用 workspaces 先例。
 */

/** BA org 管理面窄类型（服务端 API·非 HTTP）。 */
interface OrganizationOrgApi {
  listMembers(p: { headers: Record<string, unknown> }): Promise<unknown>;
  updateMemberRole(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  removeMember(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  listInvitations(p: { headers: Record<string, unknown> }): Promise<unknown>;
  createInvitation(p: {
    headers: Record<string, unknown>;
    body: { email: string; role: string };
  }): Promise<unknown>;
  cancelInvitation(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
}

@ApiExtraModels(ApiEnvelope, ApiErrorResponse)
@ApiTags('organizations')
@Controller('organizations')
@UseGuards(TenantIsolationGuard, AuthorizationGuard)
export class OrganizationsOrgAdminController {
  constructor(
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    // 领域细化重构 A5：角色存在性知识属 authorization，经 published port 消费（不再直注应用服务类）。
    @Inject(ROLE_ASSIGNABILITY_READER) private readonly roleAssignability: RoleAssignabilityReader,
  ) {}

  private ba(): OrganizationOrgApi {
    const auth = this.authInstance.get();
    if (!auth)
      throw new ForbiddenException('Auth instance not initialized', {
        errorCode: ERROR_CODES.AUTH_PROVIDER_UNAVAILABLE,
      });
    return auth.api as unknown as OrganizationOrgApi;
  }

  /**
   * 角色可挂载存在性闸（module-rbac-dynamic-roles S3·§2.5）：`role` 须 ∈ 系统三 key ∪ 本租
   * 在库自定义角色——严格在库 fail-closed，词汇外角色不得挂成员/邀请（DTO 仅校形态）。
   */
  private async assertRoleAssignable(role: string): Promise<void> {
    if (!(await this.roleAssignability.isRoleAssignable(role))) {
      throw new BadRequestException(`Role not assignable in this organization: ${role}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
  }

  @Get('members')
  @Can('read', 'Member')
  @ApiOperation({ summary: 'List members of the active organization (all roles · CASL read)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Member list (membership data from Better Auth)',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(403, 'No active organization / CASL deny / not a member.'))
  async listMembers(@Headers() headers: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.ba().listMembers({ headers });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('members/role')
  @Can('update', 'Member')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a member role (owner/admin · CASL update)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Updated member',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role) / last-owner guard (BA).'))
  async updateMemberRole(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: updateMemberRoleSchema }) dto: UpdateMemberRole,
  ): Promise<unknown> {
    await this.assertRoleAssignable(dto.role);
    try {
      return await this.ba().updateMemberRole({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('members/remove')
  @Can('delete', 'Member')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member (owner/admin · CASL delete)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Removed member',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role) / self-removal guard (BA).'))
  async removeMember(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: removeMemberSchema }) dto: RemoveMember,
  ): Promise<unknown> {
    try {
      return await this.ba().removeMember({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Get('invitations')
  @Can('read', 'Invitation')
  @ApiOperation({ summary: 'List pending invitations of the active organization (all roles)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation list (data from Better Auth)',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(403, 'No active organization / CASL deny / not a member.'))
  async listInvitations(@Headers() headers: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.ba().listInvitations({ headers });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('invitations')
  @Can('create', 'Invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invite a member to the active organization (owner/admin · CASL create)',
  })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Created invitation',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role).'))
  async createInvitation(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: createInvitationSchema }) dto: CreateInvitation,
  ): Promise<unknown> {
    await this.assertRoleAssignable(dto.role);
    try {
      return await this.ba().createInvitation({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }

  @Post('invitations/cancel')
  @Can('cancel', 'Invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an invitation (owner/admin · CASL cancel)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Cancelled invitation',
      ssotHint: 'Better Auth auth.api.*（服务端直调透传）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role) / not cancellable (BA).'))
  async cancelInvitation(
    @Headers() headers: Record<string, unknown>,
    @Body({ schema: invitationIdSchema }) dto: InvitationId,
  ): Promise<unknown> {
    try {
      return await this.ba().cancelInvitation({ headers, body: dto });
    } catch (err) {
      return mapBaError(err);
    }
  }
}

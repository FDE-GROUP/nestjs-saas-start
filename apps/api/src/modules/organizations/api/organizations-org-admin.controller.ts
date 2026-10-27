import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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
import { TenantMemberFacadeService } from '../application/tenant-member-facade.service';

/**
 * 租户成员/邀请**管理门面**（global-role-membership-tenantization 切片 D·租级化）。
 *
 * @remarks
 * 新宪落点：授权裁决 = `@Can` + CASL（authorization-rules 单源·经 `AuthorizationGuard` 判定）；
 * 数据操作 = 自有租级 SSOT（`tenant_membership`/`tenant_role_assignment`/`tenant_invitation`）经
 * {@link TenantMemberFacadeService} 编排——**替代此前 BA `auth.api.*` org 维 passthrough**
 * （成员/邀请整轴上收租户维·org 降为纯数据分组）。角色可挂载校验、last-owner / self-removal 守卫、
 * 席位卡点均在门面/领域侧重建（fail-closed·不再依赖 BA 内置数据守卫）。
 *
 * 租户作用域路由：不豁免（S11 全局墙 fail-closed），guard 组合沿用 workspaces 先例。
 * @public
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse)
@ApiTags('organizations')
@Controller('organizations')
@UseGuards(TenantIsolationGuard, AuthorizationGuard)
export class OrganizationsOrgAdminController {
  constructor(private readonly facade: TenantMemberFacadeService) {}

  /**
   * 列出活动租户的成员（全角色·CASL read）。
   * @returns 租级成员列表（`tenant_membership` ⋈ `tenant_role_assignment` ⋈ user）。
   */
  @Get('members')
  @Can('read', 'Member')
  @ApiOperation({ summary: 'List members of the active tenant (all roles · CASL read)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Member list (tenant-level membership SSOT)',
      ssotHint: 'tenant_membership + tenant_role_assignment（自有租级表）',
    }),
  )
  @ApiResponse(apiError(403, 'No active tenant / CASL deny / not a member.'))
  listMembers() {
    return this.facade.listMembers();
  }

  /**
   * 更新成员角色（owner/admin·CASL update）。
   * @param dto - 目标成员用户 id（`memberId`·租级以 userId 定位）+ 新角色载荷。
   * @returns 空体（守卫拒经门面译 400/403/404）。
   */
  @Post('members/role')
  @Can('update', 'Member')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a member role (owner/admin · CASL update)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Updated member',
      ssotHint: 'tenant_role_assignment（自有租级表）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role) / last-owner guard.'))
  @ApiResponse(apiError(400, 'Role not assignable.'))
  async updateMemberRole(@Body({ schema: updateMemberRoleSchema }) dto: UpdateMemberRole) {
    await this.facade.updateMemberRole(dto.memberId, dto.role);
    return { ok: true };
  }

  /**
   * 移除成员（owner/admin·CASL delete）。
   * @param dto - 目标成员用户 id 载荷。
   * @returns 空体（自移/最后属主拒经门面译 403）。
   */
  @Post('members/remove')
  @Can('delete', 'Member')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member (owner/admin · CASL delete)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Removed member',
      ssotHint: 'tenant_membership（自有租级表）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role) / self-removal / last-owner guard.'))
  async removeMember(@Body({ schema: removeMemberSchema }) dto: RemoveMember) {
    await this.facade.removeMember(dto.memberId);
    return { ok: true };
  }

  /**
   * 列出活动租户的待处理邀请（全角色·CASL read）。
   * @returns 租级邀请列表（`tenant_invitation`）。
   */
  @Get('invitations')
  @Can('read', 'Invitation')
  @ApiOperation({ summary: 'List pending invitations of the active tenant (all roles)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Invitation list (tenant-level invitation SSOT)',
      ssotHint: 'tenant_invitation（自有租级表）',
    }),
  )
  @ApiResponse(apiError(403, 'No active tenant / CASL deny / not a member.'))
  listInvitations() {
    return this.facade.listInvitations();
  }

  /**
   * 邀请成员加入活动租户（owner/admin·CASL create·席位在接受时点卡·非发邀）。
   * @param dto - 邮箱 + 角色载荷。
   * @returns 空体（角色不可挂载/重复 pending 邀经门面译 400）。
   */
  @Post('invitations')
  @Can('create', 'Invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite a member to the active tenant (owner/admin · CASL create)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Created invitation',
      ssotHint: 'tenant_invitation（自有租级表）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role).'))
  @ApiResponse(apiError(400, 'Role not assignable / duplicate pending invitation.'))
  async createInvitation(@Body({ schema: createInvitationSchema }) dto: CreateInvitation) {
    await this.facade.createInvitation(dto.email, dto.role);
    return { ok: true };
  }

  /**
   * 取消邀请（owner/admin·CASL cancel）。
   * @param dto - 邀请 id 载荷。
   * @returns 空体（无 pending 行经门面译 404）。
   */
  @Post('invitations/cancel')
  @Can('cancel', 'Invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an invitation (owner/admin · CASL cancel)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Cancelled invitation',
      ssotHint: 'tenant_invitation（自有租级表）',
    }),
  )
  @ApiResponse(apiError(403, 'CASL deny (member role).'))
  @ApiResponse(apiError(404, 'Pending invitation not found.'))
  async cancelInvitation(@Body({ schema: invitationIdSchema }) dto: InvitationId) {
    await this.facade.cancelInvitation(dto.invitationId);
    return { ok: true };
  }
}

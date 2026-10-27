import {
  ROLE_ASSIGNABILITY_READER,
  type RoleAssignabilityReader,
} from '@app/modules/authorization/domain/ports/role-assignability.port';
import {
  TENANT_INVITATION_MANAGER,
  type TenantInvitationManager,
  type TenantInvitationView,
} from '@app/modules/authorization/domain/ports/tenant-invitation.port';
import {
  TENANT_MEMBERSHIP_MANAGER,
  type TenantMembershipManager,
  type TenantMemberView,
} from '@app/modules/authorization/domain/ports/tenant-membership.port';
import { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

/** 接受邀请的入参形状（受邀者自助通道·invitationId 定位 pending 行）。 */
export interface AcceptInvitationInput {
  readonly invitationId: string;
}

/**
 * 租级成员/邀请管理门面服务（global-role-membership-tenantization 切片 D·organizations 核心域本体）。
 *
 * @remarks
 * 替代此前 `OrganizationsOrgAdminController` 的 **BA passthrough**：成员/角色/邀请数据操作不再透传 BA
 * org 维内置面，而是编排 authorization 自有租级 SSOT（经 published port {@link TENANT_MEMBERSHIP_MANAGER} /
 * {@link TENANT_INVITATION_MANAGER} 相遇·写侧落 authorization owned 表）。角色可挂载判定复用
 * {@link ROLE_ASSIGNABILITY_READER}（authorization published port·A5 接缝同律）。
 *
 * 守卫在门面**重建**（fail-closed）：
 *  - 角色不可挂载 → 400（`ROLE_NOT_FOUND`）；
 *  - last-owner / self-removal → 403（降级/移除唯一 owner·管理员自移）；
 *  - 接受邀请 → 受邀邮箱匹配（防他人消费邀请）+ 席位卡点 {@link QuotaService.checkSeats}（超限 402·
 *    替代退役的 BA `seats-quota.hook` 于本入租时点显式裁决）。
 *
 * 租户轴一律 {@link TenantIsolationService.requireActiveTenantId}（隔离主轴·fail-closed 403）；
 * 跨租硬地板由 manager 的 `where{tenantId}` 锚定·门面不另起炉灶。
 */
@Injectable()
export class TenantMemberFacadeService {
  constructor(
    @Inject(TenantIsolationService) private readonly ctx: TenantIsolationService,
    @Inject(TENANT_MEMBERSHIP_MANAGER) private readonly members: TenantMembershipManager,
    @Inject(TENANT_INVITATION_MANAGER) private readonly invitations: TenantInvitationManager,
    @Inject(ROLE_ASSIGNABILITY_READER) private readonly roleAssignability: RoleAssignabilityReader,
    @Inject(QuotaService) private readonly quota: QuotaService,
  ) {}

  /** 列出活动租户全部成员。 */
  listMembers(): Promise<TenantMemberView[]> {
    return this.members.listMembers(this.tenantId());
  }

  /**
   * 更新成员角色：先过角色可挂载闸，再落租级分配（守卫结果译 HTTP）。
   * @param targetUserId - 目标成员用户 id（租级以 userId 定位成员·切片 E 契约随动更名）。
   * @param role - 新角色 key。
   */
  async updateMemberRole(targetUserId: string, role: string): Promise<void> {
    await this.assertRoleAssignable(role);
    const result = await this.members.updateMemberRole(
      this.tenantId(),
      targetUserId,
      role,
      this.actorId(),
    );
    if (result === 'notFound') {
      throw new NotFoundException('Member not found', {
        errorCode: ERROR_CODES.ORG_MEMBER_NOT_FOUND,
      });
    }
    if (result === 'lastOwner') {
      throw new ForbiddenException('Cannot demote the last owner', {
        errorCode: ERROR_CODES.ORG_LAST_OWNER,
      });
    }
  }

  /**
   * 移除成员（守卫结果译 HTTP·自移/最后属主拒）。
   * @param targetUserId - 目标成员用户 id。
   */
  async removeMember(targetUserId: string): Promise<void> {
    const result = await this.members.removeMember(this.tenantId(), targetUserId, this.actorId());
    if (result === 'self') {
      throw new ForbiddenException('Cannot remove yourself', {
        errorCode: ERROR_CODES.ORG_SELF_REMOVAL,
      });
    }
    if (result === 'notFound') {
      throw new NotFoundException('Member not found', {
        errorCode: ERROR_CODES.ORG_MEMBER_NOT_FOUND,
      });
    }
    if (result === 'lastOwner') {
      throw new ForbiddenException('Cannot remove the last owner', {
        errorCode: ERROR_CODES.ORG_LAST_OWNER,
      });
    }
  }

  /** 列出活动租户的待处理邀请。 */
  listInvitations(): Promise<TenantInvitationView[]> {
    return this.invitations.listPending(this.tenantId());
  }

  /**
   * 列出发给指定邮箱的待处理邀请（个人通道 `mine`·**非租户作用域**：入组前无 active 租亦可达）。
   * @param email - 会话用户邮箱（由 `SessionGuard` 从 `@CurrentUser` 供给·可见性收敛）。
   */
  listMyInvitations(email: string): Promise<TenantInvitationView[]> {
    return this.invitations.listPendingByEmail(email);
  }

  /**
   * 拒邀（个人通道·按受邀邮箱匹配·非 pending/邮箱不符 → 404）。
   * @param invitationId - 邀请行 id。
   * @param email - 当前会话用户邮箱（guard 供给）。
   */
  async rejectInvitation(invitationId: string, email: string): Promise<void> {
    const result = await this.invitations.rejectForEmail(invitationId, email);
    if (result === 'notFound') {
      throw new NotFoundException('Pending invitation not found for this user', {
        errorCode: ERROR_CODES.ORG_INVITATION_NOT_FOUND,
      });
    }
  }

  /**
   * 发邀请（角色可挂载闸 + pending 去重·席位在**接受时点**卡·非发邀时点·沿 BA 语义）。
   * @param email - 受邀邮箱。
   * @param role - 授予角色 key。
   */
  async createInvitation(email: string, role: string): Promise<void> {
    await this.assertRoleAssignable(role);
    const result = await this.invitations.create(this.tenantId(), email, role, this.actorId());
    if (result === 'duplicate') {
      throw new BadRequestException('A pending invitation already exists for this email', {
        errorCode: ERROR_CODES.ORG_INVITATION_DUPLICATE,
      });
    }
  }

  /**
   * 取消邀请（pending → cancelled·无 pending 行 404）。
   * @param invitationId - 邀请行 id。
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    const result = await this.invitations.cancel(this.tenantId(), invitationId);
    if (result === 'notFound') {
      throw new NotFoundException('Pending invitation not found', {
        errorCode: ERROR_CODES.ORG_INVITATION_NOT_FOUND,
      });
    }
  }

  /**
   * 接受邀请（受邀者自助通道·非租户作用域：目标租取自邀请行本身）：
   *  ① pending 行存在且未过期；② 受邀者邮箱 == 受邀邮箱；③ 席位闸（超限 402）；
   *  ④ `ensureMembership` 落租成员+角色；⑤ `markAccepted` 消费一行。
   * @param invitationId - 邀请行 id。
   * @param invitee - 当前会话主体（guard 供给的 `userId`+`email`·免依赖豁免路由 ALS）。
   */
  async acceptInvitation(
    invitationId: string,
    invitee: { readonly userId: string; readonly email: string },
  ): Promise<{ tenantId: string; roleKey: string }> {
    const invitation = await this.invitations.findPendingById(invitationId);
    if (!invitation) {
      throw new NotFoundException('Pending invitation not found', {
        errorCode: ERROR_CODES.ORG_INVITATION_NOT_FOUND,
      });
    }
    if (!invitee.email || invitee.email.toLowerCase() !== invitation.email.toLowerCase()) {
      // 受邀者邮箱不匹配 → fail-closed 403（他人不可消费邀请）。
      throw new ForbiddenException('Invitation does not belong to the current user', {
        errorCode: ERROR_CODES.AUTHZ_PERMISSION_DENIED,
      });
    }
    const verdict = await this.quota.checkSeats(invitation.tenantId, 1);
    if (!verdict.ok) {
      throw new HttpException(
        `Seat quota exceeded: ${verdict.used}+1 > ${verdict.limit}`,
        HttpStatus.PAYMENT_REQUIRED,
        { errorCode: ERROR_CODES.BILLING_SEAT_LIMIT_EXCEEDED },
      );
    }
    await this.members.ensureMembership(invitation.tenantId, invitee.userId, invitation.roleKey);
    await this.invitations.markAccepted(invitationId);
    return { tenantId: invitation.tenantId, roleKey: invitation.roleKey };
  }

  /** 角色可挂载闸（严格在库 fail-closed·词汇外拒）。 */
  private async assertRoleAssignable(role: string): Promise<void> {
    if (!(await this.roleAssignability.isRoleAssignable(role))) {
      throw new BadRequestException(`Role not assignable in this tenant: ${role}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
  }

  /** 隔离主轴（活动租户·fail-closed 403）。 */
  private tenantId(): string {
    return this.ctx.requireActiveTenantId();
  }

  /** 操作者用户 id（守卫判定·系统动作缺省 null）。 */
  private actorId(): string | null {
    return this.ctx.get()?.userId ?? null;
  }
}

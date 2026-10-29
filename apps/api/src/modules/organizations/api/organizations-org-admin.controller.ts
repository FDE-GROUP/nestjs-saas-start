import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { Controller, UseGuards } from '@nestjs/common';
import { Impl } from '@orpc/nest';
import {
  orgAdminCancelInvitationContract,
  orgAdminCancelInvitationMeta,
  orgAdminCreateInvitationContract,
  orgAdminCreateInvitationMeta,
  orgAdminListInvitationsContract,
  orgAdminListInvitationsMeta,
  orgAdminListMembersContract,
  orgAdminListMembersMeta,
  orgAdminRemoveMemberContract,
  orgAdminRemoveMemberMeta,
  orgAdminUpdateRoleContract,
  orgAdminUpdateRoleMeta,
} from '@saas/api-contract/index';
import {
  createInvitationSchema,
  invitationIdSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
} from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';
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
// 换轨 WP-C：六路由转 per-method `@Impl`（非 router 扇出）——class 级 `@UseGuards(TenantIsolationGuard,
// AuthorizationGuard)` + 方法级 `@Can` 原生保留（守卫墙不弱化）；旧 `apiOkPassthrough` 无出参白名单
// → procedure 不挂 `.output`（passthrough 逐字保真）。门面抛的守卫 HttpException 经 WP-D 错误面承接。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export {
  orgAdminCancelInvitationContract,
  orgAdminCreateInvitationContract,
  orgAdminListInvitationsContract,
  orgAdminListMembersContract,
  orgAdminRemoveMemberContract,
  orgAdminUpdateRoleContract,
};

@Controller('')
@UseGuards(TenantIsolationGuard, AuthorizationGuard)
export class OrganizationsOrgAdminController {
  constructor(private readonly facade: TenantMemberFacadeService) {}

  /**
   * 列出活动租户的成员（全角色·CASL read）。
   * @returns 租级成员列表（`tenant_membership` ⋈ `tenant_role_assignment` ⋈ user）。
   */
  @Can('read', 'Member')
  @Impl(orgAdminListMembersContract)
  listMembers() {
    return os.meta(orgAdminListMembersMeta).handler(() => this.facade.listMembers());
  }

  /**
   * 更新成员角色（owner/admin·CASL update）。
   * @returns `{ ok: true }`（守卫拒经门面译 400/403/404·经 WP-D 承接）。
   */
  @Can('update', 'Member')
  @Impl(orgAdminUpdateRoleContract)
  updateMemberRole() {
    return os
      .input(updateMemberRoleSchema)
      .meta(orgAdminUpdateRoleMeta)
      .handler(async ({ input }) => {
        await this.facade.updateMemberRole(input.memberId, input.role);
        return { ok: true };
      });
  }

  /**
   * 移除成员（owner/admin·CASL delete）。
   * @returns `{ ok: true }`（自移/最后属主拒经门面译 403·经 WP-D 承接）。
   */
  @Can('delete', 'Member')
  @Impl(orgAdminRemoveMemberContract)
  removeMember() {
    return os
      .input(removeMemberSchema)
      .meta(orgAdminRemoveMemberMeta)
      .handler(async ({ input }) => {
        await this.facade.removeMember(input.memberId);
        return { ok: true };
      });
  }

  /**
   * 列出活动租户的待处理邀请（全角色·CASL read）。
   * @returns 租级邀请列表（`tenant_invitation`）。
   */
  @Can('read', 'Invitation')
  @Impl(orgAdminListInvitationsContract)
  listInvitations() {
    return os.meta(orgAdminListInvitationsMeta).handler(() => this.facade.listInvitations());
  }

  /**
   * 邀请成员加入活动租户（owner/admin·CASL create·席位在接受时点卡·非发邀）。
   * @returns `{ ok: true }`（角色不可挂载/重复 pending 邀经门面译 400·经 WP-D 承接）。
   */
  @Can('create', 'Invitation')
  @Impl(orgAdminCreateInvitationContract)
  createInvitation() {
    return os
      .input(createInvitationSchema)
      .meta(orgAdminCreateInvitationMeta)
      .handler(async ({ input }) => {
        await this.facade.createInvitation(input.email, input.role);
        return { ok: true };
      });
  }

  /**
   * 取消邀请（owner/admin·CASL cancel）。
   * @returns `{ ok: true }`（无 pending 行经门面译 404·经 WP-D 承接）。
   */
  @Can('cancel', 'Invitation')
  @Impl(orgAdminCancelInvitationContract)
  cancelInvitation() {
    return os
      .input(invitationIdSchema)
      .meta(orgAdminCancelInvitationMeta)
      .handler(async ({ input }) => {
        await this.facade.cancelInvitation(input.invitationId);
        return { ok: true };
      });
  }
}

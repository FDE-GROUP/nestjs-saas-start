/**
 * organizations 成员/邀请管理门面（org-admin）procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 租级成员/邀请管理（global-role-membership-tenantization 切片 D）：列表成员/改角色/移除 + 列表邀请/发邀/取消。
 * 租户作用域路由（不豁免·S11 全局墙 fail-closed）：class 级 `@UseGuards(TenantIsolationGuard, AuthorizationGuard)`
 * + 方法级 `@Can` 留 apps/api（CASL 单源裁决）。M4-b 响应面建模：六 op 均挂 `.output`（列表→具名 list 件·变更→`okResponseSchema`），
 * 文档/客户端型契约 + 服务端校验（@Impl 双侧同挂→handler 真跑 parse·返回与端口读模型同形无剥落）。
 */
import {
  createInvitationSchema,
  invitationIdSchema,
  okResponseSchema,
  removeMemberSchema,
  tenantInvitationViewListSchema,
  tenantMemberViewListSchema,
  updateMemberRoleSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const orgAdminListMembersMeta = openapi({
  method: 'GET',
  path: '/organizations/members',
  summary: 'List members of the active tenant (all roles · CASL read)',
});
export const orgAdminUpdateRoleMeta = openapi({
  method: 'POST',
  path: '/organizations/members/role',
  summary: 'Update a member role (owner/admin · CASL update)',
});
export const orgAdminRemoveMemberMeta = openapi({
  method: 'POST',
  path: '/organizations/members/remove',
  summary: 'Remove a member (owner/admin · CASL delete)',
});
export const orgAdminListInvitationsMeta = openapi({
  method: 'GET',
  path: '/organizations/invitations',
  summary: 'List pending invitations of the active tenant (all roles)',
});
export const orgAdminCreateInvitationMeta = openapi({
  method: 'POST',
  path: '/organizations/invitations',
  summary: 'Invite a member to the active tenant (owner/admin · CASL create)',
});
export const orgAdminCancelInvitationMeta = openapi({
  method: 'POST',
  path: '/organizations/invitations/cancel',
  summary: 'Cancel an invitation (owner/admin · CASL cancel)',
});

export const orgAdminListMembersContract = oc
  .output(tenantMemberViewListSchema)
  .meta(orgAdminListMembersMeta);
export const orgAdminUpdateRoleContract = oc
  .input(updateMemberRoleSchema)
  .output(okResponseSchema)
  .meta(orgAdminUpdateRoleMeta);
export const orgAdminRemoveMemberContract = oc
  .input(removeMemberSchema)
  .output(okResponseSchema)
  .meta(orgAdminRemoveMemberMeta);
export const orgAdminListInvitationsContract = oc
  .output(tenantInvitationViewListSchema)
  .meta(orgAdminListInvitationsMeta);
export const orgAdminCreateInvitationContract = oc
  .input(createInvitationSchema)
  .output(okResponseSchema)
  .meta(orgAdminCreateInvitationMeta);
export const orgAdminCancelInvitationContract = oc
  .input(invitationIdSchema)
  .output(okResponseSchema)
  .meta(orgAdminCancelInvitationMeta);

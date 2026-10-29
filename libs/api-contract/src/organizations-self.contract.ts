/**
 * organizations 个人通道（self）procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 租户个人通道门面（module-rbac-casl §2.3.1·self 侧）：列表/切换 active/退租/接受·拒绝邀请/列我的邀请/Odoo 可用性。
 * 全部「合法无 active 租户也可达」——类级 `@TenantIsolationExempt()` + 逐方法 `@UseGuards(SessionGuard)` 留 apps/api。
 * passthrough 面（list/setActive/leave/accept/reject/listMyInvitations）不挂 `.output`（逐字保真）；仅 odooAvailability 挂。
 * 契约携 `openapi` meta（与 apps/api `os` server procedure 共享同物体）。
 */
import {
  invitationIdSchema,
  leaveOrganizationSchema,
  organizationOdooAvailabilityViewSchema,
  setActiveOrganizationSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const selfListMeta = openapi({
  method: 'GET',
  path: '/organizations',
  summary: 'List organizations the current user belongs to (personal channel)',
});
export const selfSetActiveMeta = openapi({
  method: 'POST',
  path: '/organizations/active',
  summary: "Switch the session's active organization (must be a member)",
});
export const selfLeaveMeta = openapi({
  method: 'POST',
  path: '/organizations/members/leave',
  summary: 'Leave the active tenant (self-service · last-owner cannot leave)',
});
export const selfAcceptMeta = openapi({
  method: 'POST',
  path: '/organizations/invitations/accept',
  summary: 'Accept an invitation addressed to the current user',
});
export const selfRejectMeta = openapi({
  method: 'POST',
  path: '/organizations/invitations/reject',
  summary: 'Reject an invitation addressed to the current user',
});
export const selfListInvitationsMeta = openapi({
  method: 'GET',
  path: '/organizations/invitations/mine',
  summary: 'List pending invitations addressed to the current user',
});
export const selfOdooAvailabilityMeta = openapi({
  method: 'GET',
  path: '/organizations/odoo/availability',
  summary: 'Read the active organization Odoo availability for the apps panel (personal channel)',
});

export const selfListContract = oc.meta(selfListMeta);
export const selfSetActiveContract = oc.input(setActiveOrganizationSchema).meta(selfSetActiveMeta);
export const selfLeaveContract = oc.input(leaveOrganizationSchema).meta(selfLeaveMeta);
export const selfAcceptContract = oc.input(invitationIdSchema).meta(selfAcceptMeta);
export const selfRejectContract = oc.input(invitationIdSchema).meta(selfRejectMeta);
export const selfListInvitationsContract = oc.meta(selfListInvitationsMeta);
export const selfOdooAvailabilityContract = oc
  .output(organizationOdooAvailabilityViewSchema)
  .meta(selfOdooAvailabilityMeta);

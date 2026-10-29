/**
 * organizations 基面 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 租户申请/审批参考切片（global-tenancy S4·FR-1/FR-11/FR-12）：建租申请 + 批准/驳回 + bind-existing Odoo。
 * 逐路由守卫（会话墙/平台治理墙）与 in-handler `NotFoundException`/`mapBaError` 出口留 apps/api。
 * `:id` 路径参经紧凑 input 平并入单一对象。`successStatus` 数值字面量（201/204）。
 */
import {
  bindOdooCompanyInputSchema,
  createOrganizationApplicationSchema,
  organizationApplicationViewSchema,
  organizationIdParamSchema,
  organizationOdooBindingViewSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const orgApplyMeta = openapi({
  method: 'POST',
  path: '/organizations/applications',
  successStatus: 201,
  summary: 'Apply to create an organization (user-level · lands pending_approval)',
});
export const orgApproveMeta = openapi({
  method: 'POST',
  path: '/organizations/applications/:id/approve',
  summary: 'Approve a pending organization (platform operator · pending → active)',
});
export const orgRejectMeta = openapi({
  method: 'POST',
  path: '/organizations/applications/:id/reject',
  successStatus: 204,
  summary: 'Reject a pending organization (platform operator · hard-delete)',
});
export const orgBindOdooMeta = openapi({
  method: 'POST',
  path: '/organizations/:id/odoo-binding',
  summary: 'Bind an existing Odoo company to an active organization (platform operator)',
});

export const organizationsApplyContract = oc
  .input(createOrganizationApplicationSchema)
  .output(organizationApplicationViewSchema)
  .meta(orgApplyMeta);
export const organizationsApproveContract = oc
  .input(organizationIdParamSchema)
  .output(organizationApplicationViewSchema)
  .meta(orgApproveMeta);
export const organizationsRejectContract = oc.input(organizationIdParamSchema).meta(orgRejectMeta);
export const organizationsBindOdooContract = oc
  .input(bindOdooCompanyInputSchema)
  .output(organizationOdooBindingViewSchema)
  .meta(orgBindOdooMeta);

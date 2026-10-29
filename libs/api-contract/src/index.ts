/**
 * `@saas/api-contract` 汇面——oRPC 契约先行单源（换轨 WP-E/#2·契约前置共享包）。
 *
 * @remarks
 * re-export 契约构造根 `oc`（`@orpc/contract`）与 `openapi` meta 助手，并汇总各域叶子契约
 * （分文件居本包 `src/<domain>.contract.ts`）。消费方（apps/api controller / 未来 api-client）经
 * `@saas/api-contract/index` 显式子路径 import（承 `@saas/contracts` 同款 Node-ESM 解析约束·R-η）。
 *
 * 依赖边界：本包 = zod 传输契约（`@saas/contracts`）+ oRPC 契约层的**纯类型/契约**投影，
 * 不含服务端实现（`os`·守卫·handler 仍留 `apps/api`）；feature 叠加层（odoo-rpc-api·mcp）契约
 * 按 feature 隔离规范留在 `apps/api/src/features/**`、不入本公共包（承 `@ApiExcludeController` 对拍例外）。
 */

export {
  type AppRouterContract,
  appContractRouter,
  PUBLIC_APP_ROUTER_SPEC,
} from './app-router.contract';
export {
  authzCreateRoleContract,
  authzCreateRoleMeta,
  authzDeleteRoleContract,
  authzDeleteRoleMeta,
  authzGrantContract,
  authzGrantMeta,
  authzListGrantsContract,
  authzListGrantsMeta,
  authzListRolesContract,
  authzListRolesMeta,
  authzRenameRoleContract,
  authzRenameRoleMeta,
  authzRevokeContract,
  authzRevokeMeta,
} from './authorization-admin.contract';
export { oc, openapi } from './base';
export { healthContract, healthProcedureContract } from './health.contract';
export {
  orgApplyMeta,
  orgApproveMeta,
  organizationsApplyContract,
  organizationsApproveContract,
  organizationsBindOdooContract,
  organizationsRejectContract,
  orgBindOdooMeta,
  orgRejectMeta,
} from './organizations.contract';
export {
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
} from './organizations-org-admin.contract';
export {
  selfAcceptContract,
  selfAcceptMeta,
  selfLeaveContract,
  selfLeaveMeta,
  selfListContract,
  selfListInvitationsContract,
  selfListInvitationsMeta,
  selfListMeta,
  selfOdooAvailabilityContract,
  selfOdooAvailabilityMeta,
  selfRejectContract,
  selfRejectMeta,
  selfSetActiveContract,
  selfSetActiveMeta,
} from './organizations-self.contract';
export {
  paymentCreateCheckoutContract,
  paymentCreateCheckoutMeta,
  paymentCreateCustomerContract,
  paymentCreateCustomerMeta,
  paymentRefundContract,
  paymentRefundMeta,
  paymentRetrieveCheckoutContract,
  paymentRetrieveCheckoutMeta,
  paymentTestContract,
  paymentTestMeta,
} from './payment.contract';
export {
  platformTenantsDetailContract,
  platformTenantsDetailMeta,
  platformTenantsDiagnosticsContract,
  platformTenantsDiagnosticsMeta,
  platformTenantsExportContract,
  platformTenantsExportMeta,
  platformTenantsListContract,
  platformTenantsListMeta,
  platformTenantsPermanentRemoveContract,
  platformTenantsPermanentRemoveMeta,
  platformTenantsRemoveContract,
  platformTenantsRemoveMeta,
  platformTenantsResumeContract,
  platformTenantsResumeMeta,
  platformTenantsSuspendContract,
  platformTenantsSuspendMeta,
  platformTenantsVisibilityContract,
  platformTenantsVisibilityMeta,
} from './platform-tenants.contract';
export {
  platformUsersListContract,
  platformUsersListMeta,
  platformUsersResumeContract,
  platformUsersResumeMeta,
  platformUsersSuspendContract,
  platformUsersSuspendMeta,
} from './platform-users.contract';
export {
  postsCreateContract,
  postsCreateMeta,
  postsListContract,
  postsListMeta,
} from './posts.contract';
export {
  storageDeleteContract,
  storageDeleteMeta,
  storageUrlContract,
  storageUrlMeta,
} from './storage.contract';
export {
  subscriptionsCreateContract,
  subscriptionsCreateMeta,
  subscriptionsGetCurrentContract,
  subscriptionsGetCurrentMeta,
} from './subscriptions.contract';
export {
  tenantsListContract,
  tenantsListMeta,
  tenantsSetActiveContract,
  tenantsSetActiveMeta,
} from './tenants.contract';
export {
  usersDeleteContract,
  usersDeleteMeta,
  usersExportContract,
  usersExportMeta,
} from './users.contract';
export {
  workspacesCreateContract,
  workspacesCreateMeta,
  workspacesListContract,
  workspacesListMeta,
  workspacesRemoveContract,
  workspacesRemoveMeta,
  workspacesUpdateContract,
  workspacesUpdateMeta,
} from './workspaces.contract';

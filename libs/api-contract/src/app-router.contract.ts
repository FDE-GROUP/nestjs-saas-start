/**
 * AppRouterContract——公共对外面 oRPC procedure 的**客户端型派生单源**（换轨 WP-E/#2·契约前置 `@saas/api-contract`）。
 *
 * @remarks
 * 治理翻转后 wire 型不再来自 `openapi/openapi.yaml` codegen，而由本 router 从各域契约叶子（`@orpc/contract`·
 * zod 单源不变）**直接派生**：`typeof appContractRouter` 即前端 `createClient<AppRouterContract>` 的类型锚点
 * （承 plan §1「契约类型 SSOT 改由 oRPC router 派生」）。api-client（`packages/api-client`）与 `apps/web` 均以此型锚消费。
 *
 * - **仅公共面（56 叶）**：feature 叠加层（`mcp`·`odoo-rpc-api`）按 feature 隔离规范 + `@ApiExcludeController`
 *   留在 `apps/api/src/features/**`、不入本公共包——与旧 openapi codegen（同样排除 feature 面）客户端型面一致。
 *   `apps/api` 侧另有含 feature 叶的引用应用聚合树，仅用于其本地覆盖对拍。
 * - **纯 contract、零运行副作用**：只组合契约，不引 `@orpc/server`/`@orpc/client`、不建 HTTP link——
 *   客户端接线属 WP-F 高危 #2/#3 联签范围，本文件仅落「型」这一地基。
 * - **键 ≠ URL**：服务端路由由 `@Impl` 依 `openapi` meta（method+path）决定，本树键仅定义前端 procedure-key 的
 *   人体工学（地道 oRPC 风格·按领域资源分组、非 URL 镜像）。
 * - **覆盖由机制锁**：`app-router.contract.test.ts` 深走本树收集叶子并与本包全量 `*Contract` 导出做恒等对拍——
 *   新增/改名/漏挂 procedure 即测试红，防 router 与实存契约静默漂移。
 */
import {
  authzCreateRoleContract,
  authzDeleteRoleContract,
  authzGrantContract,
  authzListGrantsContract,
  authzListRolesContract,
  authzRenameRoleContract,
  authzRevokeContract,
} from './authorization-admin.contract';
import { oc } from './base';
import { healthProcedureContract } from './health.contract';
import {
  organizationsApplyContract,
  organizationsApproveContract,
  organizationsBindOdooContract,
  organizationsRejectContract,
} from './organizations.contract';
import {
  orgAdminCancelInvitationContract,
  orgAdminCreateInvitationContract,
  orgAdminListInvitationsContract,
  orgAdminListMembersContract,
  orgAdminRemoveMemberContract,
  orgAdminUpdateRoleContract,
} from './organizations-org-admin.contract';
import {
  selfAcceptContract,
  selfLeaveContract,
  selfListContract,
  selfListInvitationsContract,
  selfOdooAvailabilityContract,
  selfRejectContract,
  selfSetActiveContract,
} from './organizations-self.contract';
import {
  paymentCreateCheckoutContract,
  paymentCreateCustomerContract,
  paymentRefundContract,
  paymentRetrieveCheckoutContract,
  paymentTestContract,
} from './payment.contract';
import {
  platformTenantsDetailContract,
  platformTenantsDiagnosticsContract,
  platformTenantsExportContract,
  platformTenantsListContract,
  platformTenantsPermanentRemoveContract,
  platformTenantsRemoveContract,
  platformTenantsResumeContract,
  platformTenantsSuspendContract,
  platformTenantsVisibilityContract,
} from './platform-tenants.contract';
import {
  platformUsersListContract,
  platformUsersResumeContract,
  platformUsersSuspendContract,
} from './platform-users.contract';
import { postsCreateContract, postsListContract } from './posts.contract';
import { storageDeleteContract, storageUrlContract } from './storage.contract';
import {
  subscriptionsCreateContract,
  subscriptionsGetCurrentContract,
} from './subscriptions.contract';
import { tenantsListContract, tenantsSetActiveContract } from './tenants.contract';
import { usersDeleteContract, usersExportContract } from './users.contract';
import {
  workspacesCreateContract,
  workspacesListContract,
  workspacesRemoveContract,
  workspacesUpdateContract,
} from './workspaces.contract';

/**
 * 公共领域分组的原始嵌套契约树（`oc.router` 的输入·亦覆盖测深走对象·56 叶）。
 * 叶子 = 各域 `<domain>.contract.ts` 导出的 `ProcedureContract`；键为前端调用的人体工学名（procedure-key 式）。
 */
export const PUBLIC_APP_ROUTER_SPEC = {
  health: { check: healthProcedureContract },
  posts: { list: postsListContract, create: postsCreateContract },
  users: { exportData: usersExportContract, remove: usersDeleteContract },
  workspaces: {
    list: workspacesListContract,
    create: workspacesCreateContract,
    update: workspacesUpdateContract,
    remove: workspacesRemoveContract,
  },
  payment: {
    test: paymentTestContract,
    createCustomer: paymentCreateCustomerContract,
    createCheckout: paymentCreateCheckoutContract,
    retrieveCheckout: paymentRetrieveCheckoutContract,
    refund: paymentRefundContract,
  },
  storage: { remove: storageDeleteContract, url: storageUrlContract },
  subscriptions: { current: subscriptionsGetCurrentContract, create: subscriptionsCreateContract },
  tenants: { list: tenantsListContract, setActive: tenantsSetActiveContract },
  organizations: {
    // self（`@Controller('organizations')`·当前用户可见的组织关系）
    list: selfListContract,
    setActive: selfSetActiveContract,
    leave: selfLeaveContract,
    acceptInvitation: selfAcceptContract,
    rejectInvitation: selfRejectContract,
    listMyInvitations: selfListInvitationsContract,
    odooAvailability: selfOdooAvailabilityContract,
    // applications（organizations base·入驻申请流）
    applications: {
      apply: organizationsApplyContract,
      approve: organizationsApproveContract,
      reject: organizationsRejectContract,
      bindOdoo: organizationsBindOdooContract,
    },
    // members（org-admin）
    members: {
      list: orgAdminListMembersContract,
      updateRole: orgAdminUpdateRoleContract,
      remove: orgAdminRemoveMemberContract,
    },
    // invitations（org-admin）
    invitations: {
      list: orgAdminListInvitationsContract,
      create: orgAdminCreateInvitationContract,
      cancel: orgAdminCancelInvitationContract,
    },
    // roles（authorization-admin·`@Controller('organizations/roles')`）
    roles: {
      list: authzListRolesContract,
      create: authzCreateRoleContract,
      rename: authzRenameRoleContract,
      remove: authzDeleteRoleContract,
      grants: {
        list: authzListGrantsContract,
        grant: authzGrantContract,
        revoke: authzRevokeContract,
      },
    },
  },
  platform: {
    users: {
      list: platformUsersListContract,
      suspend: platformUsersSuspendContract,
      resume: platformUsersResumeContract,
    },
    tenants: {
      list: platformTenantsListContract,
      detail: platformTenantsDetailContract,
      suspend: platformTenantsSuspendContract,
      resume: platformTenantsResumeContract,
      setVisibility: platformTenantsVisibilityContract,
      remove: platformTenantsRemoveContract,
      permanentRemove: platformTenantsPermanentRemoveContract,
      diagnostics: platformTenantsDiagnosticsContract,
      exportData: platformTenantsExportContract,
    },
  },
} as const;

/** 类型锚点：`oc.router` 由公共契约树派生，供客户端型推导。 */
export const appContractRouter = oc.router(PUBLIC_APP_ROUTER_SPEC);

/** 客户端类型锚点（api-client / `apps/web` 的 `createClient<AppRouterContract>` 型参·公共 56 面）。 */
export type AppRouterContract = typeof appContractRouter;

import { AsyncLocalStorage } from 'node:async_hooks';
import type { OrganizationRole } from '../authorization/authorization-rules';

/**
 * 每请求租户作用域（global-tenancy §9.3 / FR-2）。
 *
 * @remarks
 * `organizationId` == the active organization id resolved from the Better Auth session
 * (`session.activeOrganizationId`, D4 session-cookie). `workspaceId` 由 S3 填充
 * （x-workspace-id 选择器）；`role` 由 module-rbac-casl 丙裁落地——会话解析点从 BA
 * membership 数据面预注入的活动租户成员角色（CASL 裁决输入·fail-closed 缺省 undefined）。
 *
 * @public
 */
export interface TenantIsolationScope {
  /** 所属租户 id。 */
  organizationId?: string;
  /** 所属工作区 id。 */
  workspaceId?: string;
  /** 用户 id。 */
  userId?: string;
  /** 角色标识。 */
  role?: OrganizationRole;
}

/**
 * 租户作用域 ALS store（中间件按请求绑定·下游经 `TenantIsolationService` 读回）。
 *
 * @public
 */
export const tenantIsolationStorage = new AsyncLocalStorage<TenantIsolationScope>();

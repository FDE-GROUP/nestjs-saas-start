import { AsyncLocalStorage } from 'node:async_hooks';
import type { OrganizationRole } from '../authorization/authorization-rules';

/**
 * Per-request tenant scope (global-tenancy §9.3 / FR-2).
 * `organizationId` == the active organization id resolved from the Better Auth session
 * (`session.activeOrganizationId`, D4 session-cookie). `workspaceId` 由 S3 填充
 * （x-workspace-id 选择器）；`role` 由 module-rbac-casl 丙裁落地——会话解析点从 BA
 * membership 数据面预注入的活动租户成员角色（CASL 裁决输入·fail-closed 缺省 undefined）。
 */
export interface TenantIsolationScope {
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  role?: OrganizationRole;
}

export const tenantIsolationStorage = new AsyncLocalStorage<TenantIsolationScope>();

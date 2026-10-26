import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantRole } from '../authorization/authorization-rules';

/**
 * 每请求租户作用域（global-tenancy §9.3 / FR-2）。
 *
 * @remarks
 * 主轴 `tenantId` == 活动组织所属租户（global-tenant-organization-rehierarchy 切片 C 换轴：
 * 隔离硬边界从 organizationId 升为 tenantId·同租跨组织默认互见），由中间件经**活动组织派生**
 * （BA `session.activeOrganizationId` 机制不动·§假设①）；`organizationId` 降为活动组织归属/派生源
 * （写路径双盖章 + Odoo 绑定等组织级消费点仍需）。`workspaceId` 由 S3 填充（x-workspace-id 选择器）；
 * `role` 由 module-rbac-casl 丙裁落地——会话解析点从 BA membership 数据面预注入的成员角色
 * （CASL 裁决输入·fail-closed 缺省 undefined；rehierarchy 切片 C 后角色为**租级**词汇）。
 *
 * @public
 */
export interface TenantIsolationScope {
  /** 所属租户 id（隔离硬轴·主轴·缺则下游 fail-closed 403）。 */
  tenantId?: string;
  /** 活动组织 id（归属/派生源·二级轴·非隔离边界）。 */
  organizationId?: string;
  /** 所属工作区 id。 */
  workspaceId?: string;
  /** 用户 id。 */
  userId?: string;
  /** 当前租户内成员角色（租级）。 */
  role?: TenantRole;
}

/**
 * 租户作用域 ALS store（中间件按请求绑定·下游经 `TenantIsolationService` 读回）。
 *
 * @public
 */
export const tenantIsolationStorage = new AsyncLocalStorage<TenantIsolationScope>();

import type { TenantRole } from '../authorization/authorization-rules';

/**
 * 租户派生解析端口（global-tenant-organization-rehierarchy 切片 C · 换轴派生链）。
 *
 * @remarks
 * tenancy core 需把「活动组织」升为「活动租户」作隔离主轴，但**不得**感知 ORM/实体——解析细节
 * （`organization.tenantId` 真列读取）由参考应用侧 Mikro 适配提供，沿 `SESSION_READER` 端口倒置
 * 同构（§9.5.4①B · P1b）。BA `activeOrganizationId` 会话机制**不动**（人裁假设①：租户经活动组织
 * 派生，规避 BA schema 手术）。
 *
 * fail-closed 契约：组织不存在 / 未归属租户（expand 段未盖章增量）/ 解析异常 → `undefined`，
 * 下游 `TenantIsolationGuard` 一律 403——**绝不**回退用 organizationId 冒充租户轴（轴混淆即泄露面）。
 *
 * @public
 */
export const TENANT_SCOPE_RESOLVER = Symbol('TENANT_SCOPE_RESOLVER');

/**
 * 活动组织 → 租户作用域解析结果（第三次复裁切片 3·「顺带读回」租内可见性策略）。
 * @public
 */
export interface TenantScopeResolution {
  /** 活动组织所属租户 id（隔离主轴）。 */
  tenantId: string;
  /** 该租户的租内跨组织可见性策略（`tenant.orgVisibility`）；读不回时 undefined（视同 shared）。 */
  orgVisibility?: string;
}

/** @public */
export interface TenantScopeResolver {
  /**
   * 解析活动组织的所属租户作用域（主轴 `tenantId` + 租内可见性 `orgVisibility` 顺带读回）；
   * 无归属/本体缺失 → `undefined`（fail-closed·与旧 `resolveTenantIdOf` 同契约）。
   */
  resolveTenantScopeOf(organizationId: string): Promise<TenantScopeResolution | undefined>;
  /**
   * 直读给定租户的租内跨组织可见性策略（第三次复裁切片 4·D7 显式租级激活路径）：会话携
   * `activeTenantId`（无活动组织）时，中间件据此读 `orgVisibility` 供切片 1 全局 filter 消费。
   * 本体缺失/读不回 → `undefined`（视同 shared）。纯读、无副作用。
   */
  readOrgVisibility(tenantId: string): Promise<string | undefined>;
  /**
   * 按**活动租户**解析当前用户的会话角色（global-role-membership-tenantization 切片 C 换源）：
   * 读自有 `tenant_role_assignment`（租级成员角色分配 SSOT·`unique(tenantId,userId)`），
   * 弃 BA `getActiveMemberRole` 的 org 维取法——角色从此只随活动租户解析，切 org 不翻角色。
   * fail-closed 契约：无分配行 / 本体缺失 / 读不回 → `undefined`，下游 `@Can` 守卫据此 403，
   * 绝不回退用他轴角色冒充。纯读、无副作用（适配侧 `fork({ scoped:false })` 读目录表）。
   */
  resolveTenantRole(tenantId: string, userId: string): Promise<TenantRole | undefined>;
  /**
   * 纯租级成员冷启动缺省租解析（global-role-membership-tenantization 切片 G·G5）：会话既无显式
   * 活动租、又无活动组织时，**仅当**该用户恰好归属**单一**租户才返回该租 id（免手动切租的冷启动指针）。
   * 零成员 / 多成员（须显式切租消歧）→ `undefined`（维持中间件 fail-closed 不绑主轴·403）。
   * 纯读、无副作用；跨租地板不弱化（角色仍由 `resolveTenantRole` 按活动租从 `tenant_role_assignment` 解）。
   */
  defaultTenantForUser(userId: string): Promise<string | undefined>;
}

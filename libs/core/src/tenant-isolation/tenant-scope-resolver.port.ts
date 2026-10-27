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
}

import type { AuthorizationAction, AuthorizationSubject, TenantRole } from './authorization-rules';

/**
 * 租户级权限裁决端口（global-tenancy §9.5.4①B · module-rbac-casl §2.2 换形 ·
 * module-rbac-dynamic-roles §2.3 契约修订·丁裁②）。
 *
 * `AuthorizationGuard` 声明所需授权（`@Can`），把「是否允许」的**实际裁决**委派给
 * 本端口——参考应用侧的 CASL 适配器从**租户的 DB grant 行**（`tenant_role_grant`·授权事实
 * SSOT·丙裁）投影建 ability 并判定。新宪（人裁 2026-10-17）：授权裁决归 CASL，Better Auth
 * 只管认证；角色由会话解析点预注入 ALS（丙裁），core 不 import 认证/CASL/仓储实现。
 *
 * 形状修订注记（dynamic-roles S2）：
 *  - 分区键入参——规则是 per-租户事实，同 key 角色在不同租户投影可不同；
 *    （global-tenant-organization-rehierarchy 切片 C·人裁假设②：角色**目录**升租级，分区键从
 *    `organizationId` 换 `tenantId`）；
 *  - `can` 异步——规则源为 DB（miss 时懒加载 + ensure 系统角色；命中走进程内版本缓存，
 *    守卫热路径不逐请求查库）。
 *
 * 形状扩展注记（第三次复裁 切片 2·D1·组织权限维复活）：
 *  - `organizationId` 可选（入 `can` / `listPredicate` 两入参）——ALS 活动组织：决定 org-scoped grant
 *    是否纳入（租级通配 grant `org IS NULL` ∪ 本 org 收窄 grant），并绑定 grant conditions 里的
 *    `{{organizationId}}` 模板为实值；缺省 = 无活动 org（仅通配 grant 生效·模板留字面）。角色目录仍租级
 *    `unique(tenantId,key)` 不动·org 权限维唯一落 grant 行（见 grant.organizationId）。
 *
 * 形状扩展注记（dynamic-roles S4·乙裁「仅 check 级」·丁裁②契约）：
 *  - `resource` 可选——实例级判定的**逃生舱**：不带 = 类型级裁决（守卫路径）；带上 = 交出「先取资源再判」的应用层，适配侧纳入 conditions 行并按
 *    实例匹配（query 级列表过滤已由下方 `listPredicate` 兑现·module-rbac-query-level-filtering）；
 *  - 守卫路径语义人裁改判（module-rbac-guard-instance-read A1·人 2026-10-17 令「同意」·首批仅 list 面）：
 *    `action==='read'` 时存在任一匹配 grant 行（含 conditions 行）即放行（行可见集仍由 `listPredicate` 下推治理）；
 *    写动作维持 conditions 行保守 deny（S2 over-grant 防线原样）；
 *  - `userId` 可选——绑定 grant conditions 里的 `{{userId}}` 模板为当前操作者实值（缺省即模板不可解析 → 保守 deny）。
 */

/**
 * 租户级权限裁决端口的 DI 注入 token。
 *
 * @public
 */
export const PERMISSION_CHECKER = Symbol('PERMISSION_CHECKER');

/**
 * `PermissionChecker.can` 入参（一次授权裁决所需的上下文 + 声明）。
 *
 * @public
 */
export interface PermissionCheckInput {
  /** ALS 活动租户（隔离主轴·规则分区键；rehierarchy 切片 C 换轴）；undefined = 无租户上下文（适配侧必拒）。 */
  readonly tenantId?: string;
  /** ALS 预注入的活动租户成员角色 key（系统三 key 或自定义 key）；undefined = 无/封禁/非法值。 */
  readonly role?: TenantRole;
  /** 授权动作（CASL can 第一元组参）。 */
  readonly action: AuthorizationAction;
  /** 被授权资源主体。 */
  readonly subject: AuthorizationSubject;
  /**
   * 实例级判定的资源快照（S4·check 级）。省略 = 类型级裁决（守卫路径·conditions 行保守 deny）；
   * 传入 = 适配侧携 `__caslSubjectType__=subject` 交 CASL mongo 匹配带条件的 grant 行。由应用层「先取资源再判」供给，
   * 不经全局守卫（守卫在资源加载前运行）。
   */
  readonly resource?: Record<string, unknown>;
  /** 绑定 grant conditions 中 `{{userId}}` 模板的当前操作者 id（实例级判定所需；缺省则模板不可解析 → 保守 deny）。 */
  readonly userId?: string;
  /**
   * ALS 活动组织（第三次复裁切片 2·D1）：决定 org-scoped grant 是否纳入（租级通配 ∪ 本 org）·
   * 并绑定 grant conditions 中 `{{organizationId}}` 模板为实值；缺省 = 无活动 org（仅通配 grant 生效·模板留字面）。
   */
  readonly organizationId?: string;
}

/**
 * `listPredicate` 入参（query 级列表过滤·切片 B）：无 resource（非单资源判定），以 userId 解模板。
 *
 * @public
 */
export interface PermissionListPredicateRequest {
  /** ALS 活动租户（隔离主轴·规则分区键）；undefined = 无租户上下文（适配侧必归 none）。 */
  readonly tenantId?: string;
  /** ALS 预注入的活动租户成员角色 key；undefined = 无/封禁/非法值（必归 none）。 */
  readonly role?: TenantRole;
  /** 授权动作（CASL can 第一元组参）。 */
  readonly action: AuthorizationAction;
  /** 被授权资源主体。 */
  readonly subject: AuthorizationSubject;
  /** 绑定 grant conditions 中 `{{userId}}` 模板的当前操作者 id（缺省则模板不可解析 → 该谓词落空）。 */
  readonly userId?: string;
  /**
   * ALS 活动组织（第三次复裁切片 2·D1）：决定纳入「租级通配 ∪ 本 org」grant 适用集·并解
   * conditions 中 `{{organizationId}}` 模板；缺省 = 无活动 org（仅通配 grant 参与·模板留字面落空）。
   */
  readonly organizationId?: string;
}

/**
 * `listPredicate` 三态返回（见 `PermissionChecker.listPredicate` 文档）。
 *
 * @public
 */
export type PermissionListPredicate =
  | { readonly kind: 'all' }
  | { readonly kind: 'where'; readonly where: Record<string, unknown> }
  | { readonly kind: 'none' };

/**
 * 租户级权限裁决端口（读侧：`can` 单点判定 / `listPredicate` 列表谓词）。
 *
 * @public
 */
export interface PermissionChecker {
  /**
   * 纯裁决：是否放行（异步签名·S2 规则源 DB）。
   *
   * @remarks
   * deny 由守卫落 403（fail-closed）；适配器对「查无角色/无租户/词汇外」恒拒，绝不因加载失败视同放行。
   * 守卫路径（无 resource）的 read/write 分治语义见上方「形状扩展注记」（人裁 A1）。
   *
   * @param check - 授权裁决入参
   * @returns 是否放行
   */
  can(check: PermissionCheckInput): Promise<boolean>;

  /**
   * query 级列表过滤谓词（module-rbac-query-level-filtering 切片 B·dynamic-roles §2.4 缓账兑现·丁裁契约 additive）。
   *
   * @remarks
   * 与 `can` 同源同口径：同一角色 + 同一 userId 下，列表可见集 = 逐条 `can()` 允许集（「列表 ⊆ 逐条」）。
   * 三态返回（消费方=应用层列表面 handler·见参考应用 `ListWorkspacesQueryHandler`·人裁⑤）：
   *  - `{ kind: 'all' }`：该角色对此 action/subject 存在**无条件类型级授权**（conditions=null 行）
   *    ⇒ 列表按 tenantFilter 全量（承 S2 类型级·无 instance 限制）；
   *  - `{ kind: 'where', where }`：仅带 conditions 的授权 ⇒ 实例谓词（$or 并语义·人裁②），由消费方 AND 进 tenantFilter；
   *  - `{ kind: 'none' }`：无任何匹配 grant 行 / 不可解析 / 加载失败 / 无租户无角色 ⇒ **空集**（fail-closed·绝不回退全量）。
   *
   * @param check - 列表谓词入参
   * @returns 三态谓词（all / where / none）
   */
  listPredicate(check: PermissionListPredicateRequest): Promise<PermissionListPredicate>;
}

/**
 * 租户授权投影失效端口的 DI 注入 token（module-rbac-dynamic-roles §2.3·S3 热改生效面·丁裁②契约新增）。
 *
 * @remarks
 * 读写分治：`PermissionChecker` 是读侧裁决（守卫消费），本端口是**写侧缓存失效**
 * （管理门面消费）。角色/授权经仓储变更后，同租户的 ability 投影即过时——门面调用本方法
 * 淘汰该租户全部缓存条目，下一请求重新 lazy 投影（单实例内存自洽；多实例一致性留
 * Redis pub/sub 缓账·见 plan §3）。参考应用侧由同一 CASL 适配类兼实现两端口。
 *
 * @public
 */
export const PERMISSION_INVALIDATOR = Symbol('PERMISSION_INVALIDATOR');

/**
 * 租户授权投影失效端口（写侧缓存失效·管理门面消费）。
 *
 * @public
 */
export interface PermissionInvalidator {
  /**
   * 失效某租户的全部角色 ability 投影（同步·幂等·无对应缓存条目时为空操作）。
   *
   * @param tenantId - 待失效投影的租户 id（rehierarchy 切片 C：租级角色·分区键换轴）
   */
  invalidate(tenantId: string): void;
}

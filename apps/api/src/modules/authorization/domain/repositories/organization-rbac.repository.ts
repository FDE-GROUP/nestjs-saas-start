import type {
  AuthorizationAction,
  AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';

/** 租户 RBAC 仓储端口的 DI 注入 token。 @public */
export const TENANT_RBAC_REPOSITORY = Symbol('TENANT_RBAC_REPOSITORY');

/**
 * 角色最小读模型（companion `TenantRoleRow` 的端口视形·不泄实体）。
 * @public
 */
export interface TenantRoleView {
  /** 角色行 id。 */
  readonly id: string;
  /** 唯一 key（角色/存储对象）。 */
  readonly key: string;
  /** 角色显示名。 */
  readonly name: string;
  /** 是否为内置系统角色（不可改删）。 */
  readonly isSystem: boolean;
}

/**
 * 授权行读模型：与 app 侧 CASL 投影输入（`ScopedAbilityGrant`）同构。
 * @public
 */
export interface TenantRoleGrantView {
  /** 被授权资源主体。 */
  readonly subject: AuthorizationSubject;
  /** 授权动作（CASL can 第一元组参）。 */
  readonly action: AuthorizationAction;
  /** 授权条件（ABAC 谓词·平铺等值/$in）。 */
  readonly conditions: Record<string, unknown> | null;
  /**
   * 组织收窄 scope（第三次复裁切片 2·D1）：仅**写侧** `grant` 入参携此字段指定行归属——
   * `undefined`/`null` = 租级通配（跨 org 生效·存量默认·零行为变更），字符串 = 仅该 org 生效。
   * 读投影 `toGrantView` 一律带出此字段（P0 X6）：`findGrants`（CASL 适用集）的下游 `buildScopedAbility`
   * 只消费 subject/action/conditions（忽略本字段·CASL 投影语义不变）；管理面 `listAllGrantsForRole`
   * 经 `TenantRoleGrantAdminView` 回显本字段看归属。
   */
  readonly organizationId?: string | null;
}

/**
 * 管理面授权行读模型（P0 X6）：与 `TenantRoleGrantView` 同形，但 **`organizationId` 必回显**（非收窄行为
 * `null`=租级通配）——供管理面看见 org-scoped 行的归属。CASL 适用集投影（`findGrants`）仍只消费
 * subject/action/conditions（忽略本字段），故本型仅用于 `listAllGrantsForRole` 管理读面。
 * @public
 */
export interface TenantRoleGrantAdminView extends TenantRoleGrantView {
  readonly organizationId: string | null;
}

/**
 * 审计动作词汇（留痕面·与 HTTP 动作词分离，改词不碰端点）。
 * @public
 */
export type TenantRoleAuditAction = 'create' | 'update' | 'delete' | 'grant' | 'revoke';

/**
 * grant 写入结果：`duplicate` = 同 (role,subject,action,conditions) 等值行已存在（应用层去重闸）。
 * @public
 */
export type TenantRoleGrantResult = 'granted' | 'roleNotFound' | 'duplicate' | 'invalidConditions';

/**
 * revoke 结果：`notFound` = 无匹配行（conditions 等值口径见适配器注）。
 * @public
 */
export type TenantRoleRevokeResult = 'revoked' | 'roleNotFound' | 'notFound';

/**
 * 角色 CRUD 结果：`duplicate` = unique(org,key) 撞行；`invalidKey` = 词法/保留 key 拒。
 * @public
 */
export type TenantRoleCreateResult = 'created' | 'duplicate' | 'invalidKey';
/**
 * 角色改名/删除结果：`systemRoleProtected` = is_system 应屏。
 * @public
 */
export type TenantRoleMutationResult = 'ok' | 'notFound' | 'systemRoleProtected';

/**
 * 租户 RBAC 仓储端口（domain-owned · module-rbac-dynamic-roles §2.2/§2.3）。
 *
 * @remarks
 * 新宪（丙裁）：**DB 是授权事实 SSOT**——本端口是角色/授权读写的唯一通道：
 *  - 读侧供 checker 投影（`findGrants` · S2）与存在性校验（`listRoles` · S3 DTO 改形）；
 *  - 写侧供管理门面（create/rename/delete/grant/revoke · S3），每次变更同通道落审计行（甲裁）。
 * 返回码用字面量 union（不借 HTTP 异常表达领域事实·应用层负责转译）；conditions 形状
 * 校验在 domain 策略纯函数（`policies/rbac.policy.ts`），适配器写前必过闸。
 *
 * 换轴注记（global-tenant-organization-rehierarchy 片三 K5·第三次复裁切片 2 追平）：角色**目录**仍
 * 塌缩至租级——主轴 `{tenantId, key}`·`tenant_role` 无 `organizationId` 列（unique `(tenantId,key)`·tenantId NOT NULL）；
 * 但授权 **grant 行可依组织收窄**（`tenant_role_grant.organizationId`·NULL=租级通配跨 org·非 NULL=仅该 org 生效·
 * D1）——本端口 `findGrants` 按活动 org 取「NULL ∪ 本 org」适用集·`grant` 写侧携可选 org scope。CRUD 的
 * `organizationId` 参仍兼 `tenant_role_audit` 归属盖章（活动组织缺位仍 fail-closed 拒写）。片二 K4 曾保数据 RENAME `organization_role*→tenant_role*`。
 * @public
 */
export interface TenantRbacRepository {
  /**
   * 幂等 seed：缺哪个系统角色 key 补哪个（lazy-ensure · §2.3）；grants 按 seed 死数据展开。
   * 片三 K5：角色塌纯租级·本方法不再需活动组织（角色无 org 列·不写审计）。
   * @param tenantId - 目标租户 id（租级角色唯一主轴·NOT NULL）。
   * @returns 落行完成的 Promise（无返回量）。
   */
  ensureSystemRoles(tenantId: string): Promise<void>;
  /**
   * 按 key 取角色（null = 查无 → 消费侧 fail-closed）。
   * @param tenantId - 目标租户 id。
   * @param key - 角色 key。
   * @returns 角色读模型；查无时为 `null`。
   */
  findRole(tenantId: string, key: string): Promise<TenantRoleView | null>;
  /**
   * 本租户全部角色 key（存在性校验面 · S3）。
   * @param tenantId - 目标租户 id。
   * @returns 角色 key 列表。
   */
  listRoleKeys(tenantId: string): Promise<string[]>;
  /**
   * 本租户全部角色读模型（管理门面列表 · S3·含 name/isSystem）。
   * @param tenantId - 目标租户 id。
   * @returns 角色读模型列表。
   */
  listRoles(tenantId: string): Promise<TenantRoleView[]>;
  /**
   * 角色的授权行（null = 查无角色；空数组 = 有角色零授权，两者消费侧皆 deny，但语义供缓存/门面区分）。
   * 第三次复裁切片 2（D1）：传 `activeOrgId` 时取「租级通配（org IS NULL）∪ 本 org 收窄（org = activeOrgId）」
   * 适用集；不传（租级操作·无活动 org）时仅取通配行（org-scoped 行 fail-closed 不参与无 org 上下文裁决）。
   * @param tenantId - 目标租户 id。
   * @param roleKey - 角色 key。
   * @param activeOrgId - 活动组织 id（可选·决定 org-scoped grant 是否纳入）。
   * @returns 授权行读模型列表；查无角色时为 `null`。
   */
  findGrants(
    tenantId: string,
    roleKey: string,
    activeOrgId?: string,
  ): Promise<TenantRoleGrantView[] | null>;
  /**
   * 管理面全量回显某角色的**全部**授权行（P0 X6）：**不加 org 过滤**（区别于 `findGrants` 的
   * 「NULL 通配 ∪ 本 org」适用集裁决），取该角色名下所有行并回显 `organizationId`（null=租级通配）。
   * 仅供管理面看归属/勾选态，CASL 裁决仍走 `findGrants`。
   * @param tenantId - 目标租户 id。
   * @param roleKey - 角色 key。
   * @returns 全量授权行读模型（带回显 `organizationId`）；查无角色时为 `null`。
   */
  listAllGrantsForRole(
    tenantId: string,
    roleKey: string,
  ): Promise<TenantRoleGrantAdminView[] | null>;
  /**
   * 创建自定义角色（写前过词法闸·同通道落审计行）。
   * @param tenantId - 目标租户 id。
   * @param organizationId - 活动组织 id（审计归属盖章·缺位拒写）。
   * @param key - 角色 key（租内唯一）。
   * @param name - 人面可读名。
   * @param actorId - 审计操作者；无登录主体时为 `null`。
   * @returns 领域结果码（`created`/`duplicate`/`invalidKey`）。
   */
  createRole(
    tenantId: string,
    organizationId: string | undefined,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<TenantRoleCreateResult>;
  /**
   * 角色改名（系统角色屏）。
   * @param tenantId - 目标租户 id。
   * @param organizationId - 活动组织 id（审计归属盖章·缺位拒写）。
   * @param key - 待改名的角色 key。
   * @param name - 新的人面可读名。
   * @param actorId - 审计操作者；无登录主体时为 `null`。
   * @returns 领域结果码（`ok`/`notFound`/`systemRoleProtected`）。
   */
  renameRole(
    tenantId: string,
    organizationId: string | undefined,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<TenantRoleMutationResult>;
  /**
   * 硬删角色行（grant 行由 FK cascade 消灭·审计留 before 快照）。
   * @param tenantId - 目标租户 id。
   * @param organizationId - 活动组织 id（审计归属盖章·缺位拒写）。
   * @param key - 待删除的角色 key。
   * @param actorId - 审计操作者；无登录主体时为 `null`。
   * @returns 领域结果码（`ok`/`notFound`/`systemRoleProtected`）。
   */
  deleteRole(
    tenantId: string,
    organizationId: string | undefined,
    key: string,
    actorId: string | null,
  ): Promise<TenantRoleMutationResult>;
  /**
   * 新增授权行（conditions 形状写前过 domain 策略闸）。`entry.organizationId`（可选·第三次复裁切片 2·D1）
   * 指定行组织 scope：缺省/`null`=租级通配（跨 org 生效），字符串=仅该 org 生效。
   * @param tenantId - 目标租户 id。
   * @param organizationId - 活动组织 id（审计归属盖章·缺位拒写）。
   * @param roleKey - 目标角色 key。
   * @param entry - 授权行（subject/action/conditions）。
   * @param actorId - 审计操作者；无登录主体时为 `null`。
   * @returns 领域结果码（`granted`/`roleNotFound`/`duplicate`/`invalidConditions`）。
   */
  grant(
    tenantId: string,
    organizationId: string | undefined,
    roleKey: string,
    entry: TenantRoleGrantView,
    actorId: string | null,
  ): Promise<TenantRoleGrantResult>;
  /**
   * 撤权：`conditions` 传 null = 撤整 subject 级行；传对象 = 按 JSON 等值精确撤单条件行
   * （同格多条件行的 OR 并集形态下，撤销必须指明撤哪行·甲裁表形配套语义）。
   * @param tenantId - 目标租户 id。
   * @param organizationId - 活动组织 id（审计归属盖章·缺位拒写）。
   * @param roleKey - 目标角色 key。
   * @param subject - 授权主体。
   * @param action - 授权动作。
   * @param conditions - 等值匹配条件；`null` = 整 subject 级行。
   * @param actorId - 审计操作者；无登录主体时为 `null`。
   * @param scopeOrgId - 目标 grant 行的组织 scope（第三次复裁切片 2·D1）：缺省/`null` = 租级通配行。
   * @returns 领域结果码（`revoked`/`roleNotFound`/`notFound`）。
   */
  revoke(
    tenantId: string,
    organizationId: string | undefined,
    roleKey: string,
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    conditions: Record<string, unknown> | null,
    actorId: string | null,
    scopeOrgId?: string | null,
  ): Promise<TenantRoleRevokeResult>;
}

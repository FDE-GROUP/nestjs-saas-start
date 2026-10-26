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
 * 换轴注记（global-tenant-organization-rehierarchy 切片 C·人裁假设②）：角色升**租级**——
 * 主轴参一律 `tenantId`（同租内跨组织互见的自然配套）；`organizationId` 为写路径归属盖章
 * （expand 段列仍 NOT NULL·活动组织缺位时适配器 fail-closed 拒写）。片二 K4 已将表名复原重命名
 * `organization_role*→tenant_role*`（保数据 RENAME·角色身份塌缩至纯租级另案 K5）。
 * @public
 */
export interface TenantRbacRepository {
  /**
   * 幂等 seed：缺哪个系统角色 key 补哪个（lazy-ensure · §2.3）；grants 按 seed 死数据展开。
   * @param tenantId - 目标租户 id（租级角色主轴）。
   * @param organizationId - 活动组织 id（首现角色的归属盖章；缺位则拒写 fail-closed）。
   * @returns 落行完成的 Promise（无返回量）。
   */
  ensureSystemRoles(tenantId: string, organizationId?: string): Promise<void>;
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
   * @param tenantId - 目标租户 id。
   * @param roleKey - 角色 key。
   * @returns 授权行读模型列表；查无角色时为 `null`。
   */
  findGrants(tenantId: string, roleKey: string): Promise<TenantRoleGrantView[] | null>;
  /**
   * 创建自定义角色（写前过词法闸·同通道落审计行）。
   * @param tenantId - 目标租户 id。
   * @param organizationId - 活动组织 id（归属盖章·缺位拒写）。
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
   * 新增授权行（conditions 形状写前过 domain 策略闸）。
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
  ): Promise<TenantRoleRevokeResult>;
}

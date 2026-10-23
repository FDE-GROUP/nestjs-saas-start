import type { TenantAction, TenantSubject } from '@core/saas-kit/authorization/tenant-rules';

/**
 * 租户 RBAC 仓储端口（domain-owned · module-rbac-dynamic-roles §2.2/§2.3）。
 *
 * 新宪（丙裁）：**DB 是授权事实 SSOT**——本端口是角色/授权读写的唯一通道：
 *  - 读侧供 checker 投影（`findGrants` · S2）与存在性校验（`listRoles` · S3 DTO 改形）；
 *  - 写侧供管理门面（create/rename/delete/grant/revoke · S3），每次变更同通道落审计行（甲裁）。
 * 返回码用字面量 union（不借 HTTP 异常表达领域事实·应用层负责转译）；conditions 形状
 * 校验在 domain 策略纯函数（`policies/tenant-rbac.policy.ts`），适配器写前必过闸。
 */
export const ORGANIZATION_RBAC_REPOSITORY = Symbol('ORGANIZATION_RBAC_REPOSITORY');

/** 角色最小读模型（companion `OrganizationRoleRow` 的端口视形·不泄实体）。 */
export interface OrganizationRoleView {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly isSystem: boolean;
}

/** 授权行读模型：与 app 侧 CASL 投影输入（`TenantAbilityGrant`）同构。 */
export interface OrganizationRoleGrantView {
  readonly subject: TenantSubject;
  readonly action: TenantAction;
  readonly conditions: Record<string, unknown> | null;
}

/** 审计动作词汇（留痕面·与 HTTP 动作词分离，改词不碰端点）。 */
export type OrganizationRoleAuditAction = 'create' | 'update' | 'delete' | 'grant' | 'revoke';

/** grant 写入结果：`duplicate` = 同 (role,subject,action,conditions) 等值行已存在（应用层去重闸）。 */
export type OrganizationRoleGrantResult =
  | 'granted'
  | 'roleNotFound'
  | 'duplicate'
  | 'invalidConditions';

/** revoke 结果：`notFound` = 无匹配行（conditions 等值口径见适配器注）。 */
export type OrganizationRoleRevokeResult = 'revoked' | 'roleNotFound' | 'notFound';

/** 角色 CRUD 结果：`duplicate` = unique(org,key) 撞行；`systemRoleProtected` = is_system 应屏。 */
export type OrganizationRoleCreateResult = 'created' | 'duplicate' | 'invalidKey';
export type OrganizationRoleMutationResult = 'ok' | 'notFound' | 'systemRoleProtected';

export interface OrganizationRbacRepository {
  /** 幂等 seed：缺哪个系统角色 key 补哪个（lazy-ensure · §2.3）；grants 按 seed 死数据展开。 */
  ensureSystemRoles(organizationId: string): Promise<void>;
  /** 按 key 取角色（null = 查无 → 消费侧 fail-closed）。 */
  findRole(organizationId: string, key: string): Promise<OrganizationRoleView | null>;
  /** 本租户全部角色 key（存在性校验面 · S3）。 */
  listRoleKeys(organizationId: string): Promise<string[]>;
  /** 本租户全部角色读模型（管理门面列表 · S3·含 name/isSystem）。 */
  listRoles(organizationId: string): Promise<OrganizationRoleView[]>;
  /** 角色的授权行（null = 查无角色；空数组 = 有角色零授权，两者消费侧皆 deny，但语义供缓存/门面区分）。 */
  findGrants(organizationId: string, roleKey: string): Promise<OrganizationRoleGrantView[] | null>;
  createRole(
    organizationId: string,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<OrganizationRoleCreateResult>;
  renameRole(
    organizationId: string,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<OrganizationRoleMutationResult>;
  /** 硬删角色行（grant 行由 FK cascade 消灭·审计留 before 快照）。 */
  deleteRole(
    organizationId: string,
    key: string,
    actorId: string | null,
  ): Promise<OrganizationRoleMutationResult>;
  grant(
    organizationId: string,
    roleKey: string,
    entry: OrganizationRoleGrantView,
    actorId: string | null,
  ): Promise<OrganizationRoleGrantResult>;
  /**
   * 撤权：`conditions` 传 null = 撤整 subject 级行；传对象 = 按 JSON 等值精确撤单条件行
   * （同格多条件行的 OR 并集形态下，撤销必须指明撤哪行·甲裁表形配套语义）。
   */
  revoke(
    organizationId: string,
    roleKey: string,
    subject: TenantSubject,
    action: TenantAction,
    conditions: Record<string, unknown> | null,
    actorId: string | null,
  ): Promise<OrganizationRoleRevokeResult>;
}

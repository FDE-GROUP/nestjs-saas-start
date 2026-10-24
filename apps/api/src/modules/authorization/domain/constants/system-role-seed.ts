import type {
  AuthorizationAction,
  AuthorizationSubject,
  SystemRoleKey,
} from '@core/saas-kit/authorization/authorization-rules';

/**
 * 系统角色静态 seed 死数据（module-rbac-dynamic-roles §2.1/§2.3·丙裁「全 DB 化删代码表」）。
 *
 * @remarks
 * 定位：本文件是**数据、不是规则**——旧 `TENANT_RULES` 矩阵（2026-10-17 CASL 片）逐格
 * 原样迁为死数据，供两处消费：① lazy-ensure：租户首次解析授权时无角色行则按本数据落
 * `organization_role`/`organization_role_grant` 三系统角色（幂等·is_system=true 不可改不可删）；
 * ② 迁移/seed 脚本回填。DB grant 行才是授权事实 SSOT，本数据落库后即不再被裁决链
 * 直接消费（S2 checker 换 DB 源后本文件仅剩 ensure 职责）。
 *
 * 语义注记（平移自旧矩阵注释）：`Member/Invitation` 的 `read` = 现状对拍扩项（BA 1.7.7
 * 内置端点仅验 isMember·全成员可读），非新增放权；member 对 Organization 零权限。
 * `Role`/`RoleGrant` 格 = 本片新增管理职权（module-rbac-dynamic-roles §2.5/DoD：自建角色
 * 职权仅 owner/admin·member 不可见），非旧矩阵内容；旧矩阵四 subject 格逐格不动（对拍锁测）。
 * `conditions` 恒缺省 = 整 subject 级（实例级 conditions 仅来自 DB 自定义 grant 行·S4）。
 * @public
 */
export interface SystemRoleGrantSeed {
  readonly subject: AuthorizationSubject;
  readonly actions: readonly AuthorizationAction[];
}

/**
 * 单系统角色的 seed 形状（key + 可读名 + 授权格列表）。
 * @public
 */
export interface SystemRoleSeed {
  readonly key: SystemRoleKey;
  readonly name: string;
  readonly grants: readonly SystemRoleGrantSeed[];
}

/**
 * 三系统角色（owner/admin/member）的静态 seed 死数据（lazy-ensure 与迁移脚本的唯一消费源）。
 * @public
 */
export const SYSTEM_ROLE_SEED: readonly SystemRoleSeed[] = [
  {
    key: 'owner',
    name: 'Owner',
    grants: [
      { subject: 'Organization', actions: ['update', 'delete'] },
      { subject: 'Member', actions: ['read', 'update', 'delete'] },
      { subject: 'Invitation', actions: ['read', 'create', 'cancel'] },
      { subject: 'Workspace', actions: ['create', 'read', 'update', 'delete'] },
      { subject: 'Role', actions: ['create', 'read', 'update', 'delete'] },
      { subject: 'RoleGrant', actions: ['create', 'read', 'delete'] },
    ],
  },
  {
    key: 'admin',
    name: 'Admin',
    grants: [
      { subject: 'Organization', actions: ['update'] },
      { subject: 'Member', actions: ['read', 'update', 'delete'] },
      { subject: 'Invitation', actions: ['read', 'create', 'cancel'] },
      { subject: 'Workspace', actions: ['create', 'read', 'update', 'delete'] },
      { subject: 'Role', actions: ['create', 'read', 'update', 'delete'] },
      { subject: 'RoleGrant', actions: ['create', 'read', 'delete'] },
    ],
  },
  {
    key: 'member',
    name: 'Member',
    grants: [
      { subject: 'Member', actions: ['read'] },
      { subject: 'Invitation', actions: ['read'] },
      { subject: 'Workspace', actions: ['read'] },
    ],
  },
];

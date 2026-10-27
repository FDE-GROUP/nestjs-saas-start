import type {
  AuthorizationAction,
  AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';
import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';
import { TENANT_ISOLATION_FILTERS } from '../../../../database/mikro/tenant-isolation-filter';

/**
 * 租户 RBAC 动态化三表（module-rbac-dynamic-roles §2.2·甲裁「行式 grant + 审计表」·rehierarchy 片二 K4
 * 复原 vocabulary-pivot：旧名 `organization_role*` 已更名回 `tenant_role*`）——
 * 列元数据单源 + 双变体派生（γ 惯例·global-entity-context-placement 切片 B 归位：原
 * `database/mikro/rbac-tables.ts`·判据=`table-ownership.ts` 表属主 `tenantRole*→authorization`；
 * 迁移忠实实体见 `migration-entities.ts`，本文件出运行时扁平实体入 `MIKRO_SYS_ENTITIES`）。
 * ⚠ tsx 消费链（迁移装配）文件一律**相对导入**（`@app` 别名 tsx 不解析）。
 *
 * 新宪（丙裁）：**DB 是授权事实 SSOT**——
 *  - `tenant_role`：角色（系统三 key `isSystem=true` 由 lazy-ensure 落行·不可改删；
 *    自定义角色由管理门面 CRUD）。BA `member.role` 字符串列（schema 零改动）按 `key` 关联本表。
 *  - `tenant_role_grant`：行式授权（一权限格一行·`conditions` jsonb 承载 check 级实例条件·S4），
 *    同 (subject, action) 多行 = OR 并集。DB 层**不建** unique(role,subject,action)——同格多条件行
 *    是正当形态，唯一性（含 conditions 等值）由仓储 grant 卡点应用层去重（偏差留痕登 plan §4.1），
 *    复合普通索引保投影读。
 *  - `tenant_role_audit`：变更留痕（who/what/before/after·甲裁定落库可查证），只插不改不删。
 */

export const TENANT_ROLE_META: TableMeta = {
  name: 'TenantRole',
  tableName: 'tenant_role',
  columns: [
    ['id', { k: 'text', primary: true }],
    // 角色身份塌缩至纯租级（rehierarchy 片三 K5）：去 `organizationId` 盖章列·tenantId 收紧 NOT NULL·
    // unique `(organizationId,key)→(tenantId,key)`（组织维仅存续于 `tenant_role_audit`·见审计表）。
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade' }],
    ['key', { k: 'text' }],
    ['name', { k: 'text' }],
    ['isSystem', { k: 'boolean', default: false }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    // 与 organization 表同口径：updatedAt 可空（建后未改的行不伪造时间）。
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  uniques: [{ name: 'tenant_role_tenant_key_idx', properties: ['tenantId', 'key'] }],
};

export const TENANT_ROLE_GRANT_META: TableMeta = {
  name: 'TenantRoleGrant',
  tableName: 'tenant_role_grant',
  columns: [
    ['id', { k: 'bigintAutoPk' }],
    ['roleId', { k: 'fk', target: 'TenantRole', onDelete: 'cascade' }],
    // X7（global-role-membership-tenantization 切片 C）：**废 grant 组织收窄维**（原 D1 `organizationId` 列已推翻）——
    // grant 行仅经 `roleId`→`tenant_role(tenantId,key)` 链归属租户·跨 org 通配生效。
    ['subject', { k: 'text' }],
    ['action', { k: 'text' }],
    // CASL mongo conditions 形（{ ownerId: '{{userId}}' } 模板·S4 解析）；NULL = 整 subject 级。
    ['conditions', { k: 'json', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
  ],
  indexes: [{ name: 'tenant_role_grant_role_subject_idx', properties: ['roleId', 'subject'] }],
};

export const TENANT_ROLE_AUDIT_META: TableMeta = {
  name: 'TenantRoleAudit',
  tableName: 'tenant_role_audit',
  columns: [
    ['id', { k: 'bigintAutoPk' }],
    // 租级留痕主轴（切片 C 换轴后审计读锚本列）。
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade', nullable: true }],
    // X7（切片 C）：授权上收租级·审计改按租户盖章·`organizationId` 降 **nullable**（写侧留 NULL·仅供历史行兼容）。
    ['organizationId', { k: 'fk', target: 'Organization', onDelete: 'cascade', nullable: true }],
    // 操作者可删：set null 留审计行本体（留痕不因 actor 消亡而丢）。
    ['actorId', { k: 'fk', target: 'User', onDelete: 'set null', nullable: true }],
    ['action', { k: 'text' }],
    ['roleKey', { k: 'text' }],
    ['before', { k: 'json', nullable: true }],
    ['after', { k: 'json', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
  ],
  indexes: [
    {
      name: 'tenant_role_audit_org_created_idx',
      properties: ['organizationId', 'createdAt'],
    },
  ],
};

// —— 运行时扁平实体（companion interface + 工厂派生·入 MIKRO_SYS_ENTITIES·app 仓储读写）——

export interface TenantRoleRow {
  id: string;
  /** 归属租户（片三 K5 塌缩至纯租级·NOT NULL·仓储寻址主轴）。 */
  tenantId: string;
  key: string;
  name: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}
export const TenantRole: EntitySchema<TenantRoleRow> = buildRuntimeEntity(
  TENANT_ROLE_META,
) as EntitySchema<TenantRoleRow>;

export interface TenantRoleGrantRow {
  id: number;
  roleId: string;
  subject: AuthorizationSubject;
  action: AuthorizationAction;
  conditions?: Record<string, unknown> | null;
  createdAt: Date;
}
export const TenantRoleGrant: EntitySchema<TenantRoleGrantRow> = buildRuntimeEntity(
  TENANT_ROLE_GRANT_META,
) as EntitySchema<TenantRoleGrantRow>;

export interface TenantRoleAuditRow {
  id: number;
  tenantId?: string | null;
  organizationId: string | null;
  actorId: string | null;
  action: string;
  roleKey: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: Date;
}
export const TenantRoleAudit: EntitySchema<TenantRoleAuditRow> = buildRuntimeEntity(
  TENANT_ROLE_AUDIT_META,
) as EntitySchema<TenantRoleAuditRow>;

// —— X7 租级成员/角色分配/邀请三表（global-role-membership-tenantization 切片 B）——
// 把「成员关系 + 角色分配 + 邀请入租」从 BA org 维上收为自有租级 SSOT·org 降为纯数据分组（数据可见性
// 仍由 `orgVisibility` 行级 filter 管·与授权轴正交）。此三表携 `tenantId` 主轴·**已入全局 `tenantIsolation`
// filter 在册集**（close-mech 纪律→机制：ALS 租户上下文内跨租读经硬地板自动收口·同 Workspace/Organization
// 口径）；跨租面（名册目录/计量/邀请消费点/中间件锚解析）仍须显式 `fork({ scoped:false })` + `where{tenantId}`
// 锚定（双保险·沿 X1 教训）；非 org-partitioned 表·isolated 租无 org 下不触 X3 拒所有哨兵（仅租户地板）。

/**
 * `tenant_membership`：user × tenant 租级成员关系（唯一 SSOT·`unique(tenantId,userId)`）。
 * BA `member`（org 多对多）降为「组织存在/数据分组」事实·不再作成员 SSOT（沿硬假设不动 BA schema）。
 */
export const TENANT_MEMBERSHIP_META: TableMeta = {
  name: 'TenantMembership',
  tableName: 'tenant_membership',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade' }],
    ['userId', { k: 'fk', target: 'User', onDelete: 'cascade' }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  uniques: [{ name: 'tenant_membership_tenant_user_idx', properties: ['tenantId', 'userId'] }],
  // X7 close-mech：入 `tenantIsolation` 在册集（ALS 有租上下文内跨租读自动地板收口）。
  filters: TENANT_ISOLATION_FILTERS,
};

/**
 * `tenant_role_assignment`：(user, tenant) 单角色租级分配·`unique(tenantId,userId)`（一人一租一角色）。
 * `roleKey` 逻辑关联 `tenant_role(tenantId,key)`（不建跨上下文 FK·沿本仓普通 string 列惯例）。
 * 会话角色即自此按**活动租户**解析（弃 BA `getActiveMemberRole` org 维）。
 */
export const TENANT_ROLE_ASSIGNMENT_META: TableMeta = {
  name: 'TenantRoleAssignment',
  tableName: 'tenant_role_assignment',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade' }],
    ['userId', { k: 'fk', target: 'User', onDelete: 'cascade' }],
    ['roleKey', { k: 'text' }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  uniques: [{ name: 'tenant_role_assignment_tenant_user_idx', properties: ['tenantId', 'userId'] }],
  // X7 close-mech：入 `tenantIsolation` 在册集；中间件锚解析面经显式 `scoped:false` 绕筛（它先于 ALS 绑定）。
  filters: TENANT_ISOLATION_FILTERS,
};

/**
 * `tenant_invitation`：租级邀请（受邀邮箱 → 接受后建 `tenant_membership`+`tenant_role_assignment`）。
 * 席位/配额计量按 `tenant_membership` 计·邀请预占口径沿用既有 seat hook（切片 D 收口）。
 */
export const TENANT_INVITATION_META: TableMeta = {
  name: 'TenantInvitation',
  tableName: 'tenant_invitation',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade' }],
    ['email', { k: 'text' }],
    ['roleKey', { k: 'text' }],
    ['invitorId', { k: 'fk', target: 'User', onDelete: 'set null', nullable: true }],
    ['status', { k: 'text', default: 'pending' }],
    ['token', { k: 'text' }],
    ['expiresAt', { k: 'datetime', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  uniques: [{ name: 'tenant_invitation_tenant_email_idx', properties: ['tenantId', 'email'] }],
  indexes: [{ name: 'tenant_invitation_token_idx', properties: ['token'] }],
  // X7 close-mech：入 `tenantIsolation` 在册集；受邀者 mine/accept 消费点跨租定位行经 `scoped:false` 锚定。
  filters: TENANT_ISOLATION_FILTERS,
};

export interface TenantMembershipRow {
  id: string;
  tenantId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date | null;
}
export const TenantMembership: EntitySchema<TenantMembershipRow> = buildRuntimeEntity(
  TENANT_MEMBERSHIP_META,
) as EntitySchema<TenantMembershipRow>;

export interface TenantRoleAssignmentRow {
  id: string;
  tenantId: string;
  userId: string;
  roleKey: string;
  createdAt: Date;
  updatedAt: Date | null;
}
export const TenantRoleAssignment: EntitySchema<TenantRoleAssignmentRow> = buildRuntimeEntity(
  TENANT_ROLE_ASSIGNMENT_META,
) as EntitySchema<TenantRoleAssignmentRow>;

export interface TenantInvitationRow {
  id: string;
  tenantId: string;
  email: string;
  roleKey: string;
  invitorId: string | null;
  status: string;
  token: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}
export const TenantInvitation: EntitySchema<TenantInvitationRow> = buildRuntimeEntity(
  TENANT_INVITATION_META,
) as EntitySchema<TenantInvitationRow>;

export const MIKRO_RBAC_TABLE_ENTITIES = [
  TenantRole,
  TenantRoleGrant,
  TenantRoleAudit,
  TenantMembership,
  TenantRoleAssignment,
  TenantInvitation,
];

import type {
  AuthorizationAction,
  AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';
import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

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
    // 角色升租级（global-tenant-organization-rehierarchy 切片 B·expand 段 nullable）：同租内跨组织
    // 互见的自然配套——授予键从 organizationId 换 tenantId（切片 C 换轴消费本列）。片二 K4 仅复原命名，
    // tenantId 维持 nullable（角色身份塌缩至纯租级——去 org 列·unique→(tenantId,key)——另案 K5）。
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade', nullable: true }],
    ['organizationId', { k: 'fk', target: 'Organization', onDelete: 'cascade' }],
    ['key', { k: 'text' }],
    ['name', { k: 'text' }],
    ['isSystem', { k: 'boolean', default: false }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    // 与 organization 表同口径：updatedAt 可空（建后未改的行不伪造时间）。
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  uniques: [{ name: 'tenant_role_org_key_idx', properties: ['organizationId', 'key'] }],
};

export const TENANT_ROLE_GRANT_META: TableMeta = {
  name: 'TenantRoleGrant',
  tableName: 'tenant_role_grant',
  columns: [
    ['id', { k: 'bigintAutoPk' }],
    ['roleId', { k: 'fk', target: 'TenantRole', onDelete: 'cascade' }],
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
    // 租级留痕冗余列（同上·切片 C 换轴后审计读锚本列）。
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade', nullable: true }],
    ['organizationId', { k: 'fk', target: 'Organization', onDelete: 'cascade' }],
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
  /** 归属租户（expand 段可空·角色租级化后仓储锚本列）。 */
  tenantId?: string | null;
  organizationId: string;
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
  organizationId: string;
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

export const MIKRO_RBAC_TABLE_ENTITIES = [TenantRole, TenantRoleGrant, TenantRoleAudit];

import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `workspace` 表列元数据单源 + 运行时扁平实体（global-entity-context-placement 切片 B 归位：
 * 原 `database/mikro/four-tables.ts`·判据=`table-ownership.ts` 表属主 `workspace→workspaces`）。
 *
 * 本文件是 `workspace` 列定义的**唯一真相源**：`*_META` 被 `migration-entities.ts` 经
 * `buildMigrationEntity` 消费（迁移忠实·FK 关系·受恒等闸守护），另经 `buildRuntimeEntity`
 * 派生运行时扁平实体入 `MIKRO_SYS_ENTITIES`（app 仓储读写）——两变体同源·消双描述（γ 立意）。
 * companion `interface` 提供运行时实例的 TS 形状（Mikro v7 动态工厂惯例·同 `post.entity.ts`）。
 * ⚠ tsx 消费链（迁移装配）文件一律**相对导入**（`@app` 别名 tsx 不解析）。
 */

export const WORKSPACE_META: TableMeta = {
  name: 'Workspace',
  tableName: 'workspace',
  columns: [
    ['id', { k: 'text', primary: true }],
    // 归属租户（global-tenant-organization-rehierarchy 切片 B·expand 段 nullable·FK cascade 给租户级联删除
    // 留 NFR-6 血脉；切片 C 换轴后读谓词锚本列）。
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade', nullable: true }],
    ['organizationId', { k: 'fk', target: 'Organization', onDelete: 'cascade' }],
    ['name', { k: 'text' }],
    ['slug', { k: 'text' }],
    // 实例属主（module-workspace-owner-column·人裁①②）：可空·NULL=不属任何人（受限 grant 下
    // fail-closed 不可见）·存量不回填；create 链由 handler 侧 ALS 盖章，不接受 body 伪造。
    ['ownerId', { k: 'text', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime' }],
  ],
  uniques: [{ name: 'workspace_org_slug_idx', properties: ['organizationId', 'slug'] }],
  // query 级 `where` 支下推的真实查询面（人裁④）。
  indexes: [{ name: 'workspace_org_owner_idx', properties: ['organizationId', 'ownerId'] }],
};

export interface Workspace {
  id: string;
  /** 归属租户（expand 段可空·回填后全量有值·NOT NULL 收紧留 contract 段）。 */
  tenantId?: string | null;
  organizationId: string;
  name: string;
  slug: string;
  /** 实例属主（module-workspace-owner-column）：NULL=不属任何人（受限 grant 下 fail-closed 不可见）。 */
  ownerId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const Workspace: EntitySchema<Workspace> = buildRuntimeEntity(
  WORKSPACE_META,
) as EntitySchema<Workspace>;

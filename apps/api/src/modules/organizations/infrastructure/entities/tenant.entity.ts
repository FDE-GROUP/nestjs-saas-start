import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORG_VISIBILITY } from '@core/saas-kit/modules/organizations/visibility/org-visibility';
import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `tenant` 表列元数据单源 + 运行时扁平实体（global-tenant-organization-rehierarchy 切片 B·
 * 人裁 2026-10-26「一租户多组织 · 一组织一公司」——新层级 **Tenant ⊃ Organization ⊃ Workspace**）。
 *
 * **血脉申明**：本表非 `global-tenant-entity-reclamation` 造、又被 `global-governance-lifecycle-consolidation`
 * DROP 的「组织 id 同键旁表」（`tenant.id → organization.id` FK·status 寄居表）复活——那是组织的旁表，
 * 本表是**组织之父行**（organization.tenantId FK 指向此·多组织共一租户），语义与形状均不同，勿对拍旧工件。
 * 属主=`organizations`（`table-ownership.ts` 恒等闸口径）；治理态 `status` 值域沿
 * `TENANT_STATUS` 单源（租户准入态 pending_approval→active·生命周期真相源自 rehierarchy 片一改锚本列·片三 V 词汇复裁定名·旧名 `ORGANIZATION_STATUS`）。
 *
 * 列律：L1 createdAt 必有；**新表遵 L2 `updatedAt` nullable**（建后未改即 NULL·不入棘轮豁免）。
 * ⚠ tsx 消费链（迁移装配）文件一律**相对导入**（`@app` 别名 tsx 不解析）。
 */

/** 值域 = `TENANT_STATUS` 声明序单源（同 `ba-org.entities.ts` 漂移闸口径：枚举变动由下次 generate 非空 diff 捕获）。 */
const TENANT_STATUS_CHECK_EXPRESSION = `status IN (${Object.values(TENANT_STATUS)
  .map((v) => `'${v}'`)
  .join(', ')})`;

/**
 * 值域 = `ORG_VISIBILITY` 声明序单源（第三次复裁切片 3·租内跨组织可见性策略·默认 shared 零行为变更）。
 * ⚠ 列名须带双引号：`orgVisibility` 为 camelCase 物理列（建列时加引号保留大小写），CHECK 表达式若不引号
 * 会被 PG 折叠为小写 `orgvisibility` 而 `column does not exist`（沿 column-meta「expression 须用物理列名」律）。
 */
const TENANT_ORG_VISIBILITY_CHECK_EXPRESSION = `"orgVisibility" IN (${Object.values(ORG_VISIBILITY)
  .map((v) => `'${v}'`)
  .join(', ')})`;

export const TENANT_META: TableMeta = {
  name: 'Tenant',
  tableName: 'tenant',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['name', { k: 'text' }],
    ['slug', { k: 'text' }],
    // 租户治理生命周期态（准入闸·切片 D provisioning.submit 申请对象改本列）：NOT NULL DEFAULT 'active'，
    // 回填期存量经 1:1 骨架自 organization.status 搬入（backfill 工件语义等价律注）。
    ['status', { k: 'text', default: TENANT_STATUS.ACTIVE }],
    // 租内跨组织可见性策略（第三次复裁切片 3·D2）：NOT NULL DEFAULT 'shared'——存量逐字节等价（互见），
    // isolated 为显式 opt-in 经全局 filter 追加组织收窄（切片 1 消费）；跨租硬地板 tenantId 不受本列影响。
    ['orgVisibility', { k: 'text', default: ORG_VISIBILITY.SHARED }],
    // 租成员数**物化计数**（第三次复裁切片 5·D6/pt10）：NOT NULL DEFAULT 0——由 `member` 表上的 AFTER
    // INSERT/DELETE **库级触发器**增量维护（唯一能覆盖 BA 直写 member 全路径·含建租者 auto-join 的物化器）。
    // 读侧 `countMembers` 走本列 O(1)；两跳联表（organization.tenantId→member）降为 doctor/对拍校验（不为本列真相）。
    ['memberCount', { k: 'integer', default: 0 }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  // slug 全局唯一（第三次复裁切片 6·D5 contract 段）：早先 expand 段不预支（存量 organization.slug 无库级
  // 全局 unique·1:1 骨架回填碰 duplicate 即炸）；本段迁移先清洗存量 duplicate 再加 global unique 约束。
  uniques: [{ name: 'tenant_slug_unique', properties: ['slug'] }],
  checks: [
    { name: 'tenant_status_check', expression: TENANT_STATUS_CHECK_EXPRESSION },
    { name: 'tenant_org_visibility_check', expression: TENANT_ORG_VISIBILITY_CHECK_EXPRESSION },
  ],
};

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  orgVisibility: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date | null;
}
export const Tenant: EntitySchema<Tenant> = buildRuntimeEntity(TENANT_META) as EntitySchema<Tenant>;

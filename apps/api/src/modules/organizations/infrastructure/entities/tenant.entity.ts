import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `tenant` 表列元数据单源 + 运行时扁平实体（global-tenant-organization-rehierarchy 切片 B·
 * 人裁 2026-10-26「一租户多组织 · 一组织一公司」——新层级 **Tenant ⊃ Organization ⊃ Workspace**）。
 *
 * **血脉申明**：本表非 `global-tenant-entity-reclamation` 造、又被 `global-governance-lifecycle-consolidation`
 * DROP 的「组织 id 同键旁表」（`tenant.id → organization.id` FK·status 寄居表）复活——那是组织的旁表，
 * 本表是**组织之父行**（organization.tenantId FK 指向此·多组织共一租户），语义与形状均不同，勿对拍旧工件。
 * 属主=`organizations`（`table-ownership.ts` 恒等闸口径）；治理态 `status` 值域暂沿
 * `ORGANIZATION_STATUS` 单源（租户准入态 pending_approval→active·切片 D 审批链上移后语义随动，
 * 词汇复裁 `TENANCY_*` 留 C/D 收口）。
 *
 * 列律：L1 createdAt 必有；**新表遵 L2 `updatedAt` nullable**（建后未改即 NULL·不入棘轮豁免）。
 * ⚠ tsx 消费链（迁移装配）文件一律**相对导入**（`@app` 别名 tsx 不解析）。
 */

/** 值域 = `ORGANIZATION_STATUS` 声明序单源（同 `ba-org.entities.ts` 漂移闸口径：枚举变动由下次 generate 非空 diff 捕获）。 */
const TENANT_STATUS_CHECK_EXPRESSION = `status IN (${Object.values(ORGANIZATION_STATUS)
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
    ['status', { k: 'text', default: ORGANIZATION_STATUS.ACTIVE }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  // slug 唯一性不在 expand 段预支：存量 organization.slug 无库级全局 unique（BA 仅租内核验），
  // 1:1 骨架回填碰 duplicate 即炸——收紧（unique + 清洗）留 contract 段随 NOT NULL 一并裁。
  checks: [{ name: 'tenant_status_check', expression: TENANT_STATUS_CHECK_EXPRESSION }],
};

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date | null;
}
export const Tenant: EntitySchema<Tenant> = buildRuntimeEntity(TENANT_META) as EntitySchema<Tenant>;

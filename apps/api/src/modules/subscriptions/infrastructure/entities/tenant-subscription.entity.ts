import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `tenant_subscription` 表列元数据单源 + 运行时扁平实体（global-tenant-organization-rehierarchy 切片 B·
 * 计费单位上移：订阅/席位/配额锚从 organization 升 **tenant**——一租多组织后按租户总量控制才是正当语义）。
 *
 * 自 `organization_subscription`（`ORGANIZATION_SUBSCRIPTION_META`）**结构平移**：FK 换 `tenantId`，
 * 其余列形一致。**expand 段两表并存**——旧表读写链切至本表（切片 D）后方入 contract 段退役；
 * 存量行由本案回填工件 1:1 骨架对偶搬入（tenantId=organizationId 时期等值）。
 *
 * **新表违 L2 即闸红** ⇒ `updatedAt` 取 `nullable()`（与旧表 NOT NULL 盖章口径刻意不同——旧表在
 * `UPDATED_AT_NULLABLE_EXEMPT` 棘轮账上只减不增，本表不入任何豁免）；ES R4c 投影语义注记随
 * 读路径上移（切片 D）平移至本文件，此处先行承载 DDL 面。
 * ⚠ tsx 消费链（迁移装配）文件一律**相对导入**（`@app` 别名 tsx 不解析）。
 */

export const TENANT_SUBSCRIPTION_META: TableMeta = {
  name: 'TenantSubscription',
  tableName: 'tenant_subscription',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade' }],
    ['plan', { k: 'text' }],
    ['status', { k: 'text', default: 'active' }],
    ['seatsLimit', { k: 'integer' }],
    ['storageQuota', { k: 'integer', nullable: true }],
    ['apiQuota', { k: 'integer', nullable: true }],
    ['periodStart', { k: 'datetime', defaultNow: true }],
    ['periodEnd', { k: 'datetime', nullable: true }],
    ['provider', { k: 'text', nullable: true }],
    ['providerCustomerId', { k: 'text', nullable: true }],
    ['providerSubscriptionId', { k: 'text', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  indexes: [
    { name: 'tenant_subscription_tenant_status_idx', properties: ['tenantId', 'status'] },
    { name: 'tenant_subscription_tenant_period_idx', properties: ['tenantId', 'periodStart'] },
  ],
};

export interface TenantSubscription {
  id: string;
  tenantId: string;
  plan: string;
  status: string;
  seatsLimit: number;
  storageQuota?: number | null;
  apiQuota?: number | null;
  periodStart: Date;
  periodEnd?: Date | null;
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  createdAt: Date;
  updatedAt?: Date | null;
}
export const TenantSubscription: EntitySchema<TenantSubscription> = buildRuntimeEntity(
  TENANT_SUBSCRIPTION_META,
) as EntitySchema<TenantSubscription>;

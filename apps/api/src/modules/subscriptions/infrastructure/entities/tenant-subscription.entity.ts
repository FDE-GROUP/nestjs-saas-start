import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `tenant_subscription` 表列元数据单源 + 运行时扁平实体（global-entity-context-placement 切片 B 归位：
 * 原 `database/mikro/four-tables.ts`·判据=`table-ownership.ts` 表属主 `tenantSubscription→subscriptions`）。
 * 同源双变体语义与相对导入约束见 `workspace.entity.ts` 头注。
 */

export const TENANT_SUBSCRIPTION_META: TableMeta = {
  name: 'TenantSubscription',
  tableName: 'tenant_subscription',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['tenantId', { k: 'fk', target: 'Organization', onDelete: 'cascade' }],
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
    ['updatedAt', { k: 'datetime' }],
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
  updatedAt: Date;
}
export const TenantSubscription: EntitySchema<TenantSubscription> = buildRuntimeEntity(
  TENANT_SUBSCRIPTION_META,
) as EntitySchema<TenantSubscription>;

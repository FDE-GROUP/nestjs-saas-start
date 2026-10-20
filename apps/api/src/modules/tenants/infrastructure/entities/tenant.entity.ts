import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `tenant` 表列元数据单源 + 运行时扁平实体（global-tenant-entity-reclamation 切片 A · 人签
 * 2026-10-20）——租户生命周期态**收权入自有表**：此前态机寄居 BA `organization.metadata`（jsonb），
 * 与宪法「BA=纯认证与成员数据源」定位相悖（S4 当时的「无迁移」最小路径已被修订）。
 *
 * 表形（签核裁②定稿）：
 *  - **旁表同值 PK**：`id` = `organization.id`（沿 `user_status` 旁表先例）·FK→organization
 *    `on delete cascade`（org 硬删即灭租户户籍·与治理 `destroy` 五子表 cascade 同律）；
 *    下游 `tenantId` 锚不改指（裁④）——tenant.id 恒等于 organization.id，户籍与本体同值。
 *  - **status 真列 + DB CHECK**：值域自 `TENANT_STATUS` 单源生成（枚举漂移由下次
 *    `migration:generate` 非空 diff 捕获）；仓内首条 CHECK——应用层态机卡点之上的 DB 防线。
 *  - **L2 新表方向**：`updatedAt` nullable（建后未改即 NULL·不入棘轮豁免）；`createdAt`
 *    `DEFAULT now()`。不预置扩展位（禁空 jsonb 垃圾策略）。
 *
 * 存量 org 无租户行 = 合法「无记录」态（deny-list 不拦·`canTransition` 视同 active），
 * backfill 迁移为既有 org 建行——两态语义与旧 metadata 面逐字等价（见迁移工件头注）。
 * 同源双变体语义与相对导入约束见 `workspace.entity.ts` 头注（`@core/saas-kit` 为 workspace
 * 实包·值导入可进 tsx 链·沿 `seed.ts` 先例）。
 */

/** CHECK 表达式（物理列名 `status`·值域 = TENANT_STATUS 声明序单源）。 */
const STATUS_CHECK_EXPRESSION = `status IN (${Object.values(TENANT_STATUS)
  .map((v) => `'${v}'`)
  .join(', ')})`;

export const TENANT_META: TableMeta = {
  name: 'Tenant',
  tableName: 'tenant',
  columns: [
    // 旁表 PK-FK：id 即 organization.id（同值·显式压回 updateRule no action 求与 user_status 同律）。
    [
      'id',
      {
        k: 'fk',
        target: 'Organization',
        onDelete: 'cascade',
        onUpdate: 'no action',
        primary: true,
      },
    ],
    ['status', { k: 'text' }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime', nullable: true }],
  ],
  checks: [{ name: 'tenant_status_check', expression: STATUS_CHECK_EXPRESSION }],
};

export interface Tenant {
  id: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt?: Date | null;
}
export const Tenant: EntitySchema<Tenant> = buildRuntimeEntity(
  TENANT_META,
) as unknown as EntitySchema<Tenant>;

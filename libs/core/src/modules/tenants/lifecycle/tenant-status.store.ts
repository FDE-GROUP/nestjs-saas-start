import type { TenantStatus } from './tenant-lifecycle';

/**
 * Tenant status store port（global-tenancy S10 · §9.5.4①B 端口倒置·
 * global-tenant-entity-reclamation 切片 B 换轨为 **status 导向三原语**·对拍 `UserStatusStore` 形）。
 *
 * `TenantStatusService` 是租户生命周期状态的**唯一读写卡点**，但它本身**不应感知**具体
 * 表形（自有 `tenant` 户籍表 / BA `organization` 存在性）。此前端口透传 `organization.metadata`
 * （jsonb）系 S4「无迁移」最小路径——存储决策已被收权案修订：态存 `tenant.status` 真列，
 * BA 缩回宪法「纯认证与成员数据源」定位，metadata 词汇从本链路彻底退场。
 *
 * 语义约定（与旧 deny-list 逐字等价）：
 *  - `readStatus`：`tenant` 行不存在 → `undefined`（存量/seeded 无户籍 = 「无状态记录」，
 *    deny-list 不拦、迁移表视同 active——非「组织不存在」）；
 *  - `organizationExists`：`organization` 行命中与否——`transition` 的 not-found（404）判据
 *    仍是**本体存在性**，与户籍行有无无关；
 *  - `upsert`：存在则更新 status/updatedAt，不存在则落户籍行（治理动作即时入册·沿
 *    `UserStatusStore.upsert` 同律）。
 */
export const TENANT_STATUS_STORE = Symbol('TENANT_STATUS_STORE');

export interface TenantStatusStore {
  /** `tenant` 行状态；无行（无户籍）→ `undefined`（deny-list：视同 active）。 */
  readStatus(organizationId: string): Promise<TenantStatus | undefined>;
  /** 组织本体是否存在（`organization` 行命中）——不存在则 transition 报 not-found。 */
  organizationExists(organizationId: string): Promise<boolean>;
  /** upsert `tenant` 户籍行（存在则更新 status/updatedAt·不存在则建行）。 */
  upsert(organizationId: string, status: TenantStatus): Promise<void>;
}

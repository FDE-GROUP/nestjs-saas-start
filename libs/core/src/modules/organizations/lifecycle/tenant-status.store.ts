import type { TenancyStatus } from './organization-lifecycle';

/**
 * 租户状态存储端口的 DI 注入 token（global-tenant-organization-rehierarchy 切片 E-F · 治理换轴·
 * `TenantStatusService` 唯一写卡点·status 导向三原语形制）。
 *
 * @remarks
 * 复裁定（人裁 2026-10-26「一租户多组织 · 一组织一公司」）将**治理准入态**从 `organization.status`
 * **上移归位 `tenant.status`**（Tenant = 隔离与计费边界·审批只管租户准入）。Organization 保留轻量
 * 自有态（`canUseOdoo` 仍读 org.status active），但审批/暂停/恢复/驳回/删除的**权威态**是本端口。
 *
 * 语义约定（仅锚定表为 tenant）：
 *  - `readStatus`：`tenant.status` NOT NULL 真列，本体存在即有值；本体行不存在 → `undefined`；
 *  - `tenantExists`：`tenant` 行命中与否——`transition` 的 not-found（404）判据；
 *  - `upsert`：治理迁移即变更——直写 `tenant.status` 并盖 `updatedAt`。
 *
 * 存量一致性：切片 B 回填迁移 `Migration20261026084000` 已把 `organization.status` 原值搬入
 * `tenant.status`（1:1 骨架·同持治理态），换轴读写两侧一致，无孤儿态。
 * @public
 */
export const TENANT_STATUS_STORE = Symbol('TENANT_STATUS_STORE');

/**
 * 租户状态持久化端口：status 导向三原语（读态/判存/写态）·锚 `tenant.status` 真列。
 * @public
 */
export interface TenantStatusStore {
  /**
   * 准入态归位后的 `tenant.status` 真列值；本体行不存在 → `undefined`（deny-list：视同 active）。
   * @param tenantId - 目标租户 id。
   * @returns 状态列值；无本体返回 `undefined`。
   */
  readStatus(tenantId: string): Promise<TenancyStatus | undefined>;
  /**
   * 租户本体是否存在（`tenant` 行命中）——不存在则 transition 报 not-found。
   * @param tenantId - 目标租户 id。
   * @returns 命中返回 `true`；否则 `false`。
   */
  tenantExists(tenantId: string): Promise<boolean>;
  /**
   * 治理迁移即变更：准入态归位 `tenant.status`，直写该真列（盖 updatedAt）。
   * @param tenantId - 目标租户 id。
   * @param status - 迁移后状态。
   */
  upsert(tenantId: string, status: TenancyStatus): Promise<void>;
}

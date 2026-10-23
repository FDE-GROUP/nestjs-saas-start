import type { OrganizationStatus } from './organization-lifecycle';

/**
 * Tenant status store port（global-tenancy S10 · §9.5.4①B 端口倒置·status 导向三原语·
 * 对拍 `UserStatusStore` 形）。
 *
 * `OrganizationStatusService` 是租户生命周期状态的**唯一读写卡点**，但它本身**不应感知**具体
 * 表形。global-governance-lifecycle-consolidation 切片 B（人裁 2026-10-23）：态从自有 `tenant`
 * 旁表**归位 `organization.status` 真列**（BA 表共享·additive 自撰域列）·旁表随本案 DROP。
 * 早期「落 organization.metadata（jsonb）」与后续「自有 tenant 表」两种存储决策均已修订；
 * 本端口不感知列落在哪张表（当前=organization.status）。
 *
 * 语义约定：
 *  - `readStatus`：`organization.status` 为 NOT NULL 真列，本体存在即有值（缺席态消失·O1 已堵）；
 *    本体行不存在 → `undefined`；
 *  - `organizationExists`：`organization` 行命中与否——`transition` 的 not-found（404）判据；
 *  - `upsert`：治理迁移即变更——直写 `organization.status` 并盖 `updatedAt`（`transition` 已先卡存本体·恒为 UPDATE）。
 */
export const ORGANIZATION_STATUS_STORE = Symbol('ORGANIZATION_STATUS_STORE');

export interface OrganizationStatusStore {
  /** `organization.status` 真列值；本体行不存在 → `undefined`（deny-list：视同 active）。 */
  readStatus(organizationId: string): Promise<OrganizationStatus | undefined>;
  /** 组织本体是否存在（`organization` 行命中）——不存在则 transition 报 not-found。 */
  organizationExists(organizationId: string): Promise<boolean>;
  /** 治理迁移即变更：直写 `organization.status`（盖 updatedAt）。 */
  upsert(organizationId: string, status: OrganizationStatus): Promise<void>;
}

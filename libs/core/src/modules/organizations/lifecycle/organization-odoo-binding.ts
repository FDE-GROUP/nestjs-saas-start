/**
 * 组织 ↔ Odoo 公司绑定态词汇与可用性裁决（module-org-odoo-company-mapping 切片 A ·
 * 纯函数 · 零框架依赖，沿 `organization-lifecycle` 同区纪律）。
 *
 * @remarks
 * 架构前提（人裁 2026-10-26·均留痕 research/data-warehouse-introduction.md §1）：
 * - 一租户一公司（`res.company`）·单库多公司；SaaS 平台库与 Odoo 库**物理隔离、平行映射**
 *   （跨库弱引用，无外键/无跨库 JOIN，Odoo 数据读写只经 RPC 通道）；
 * - **公司创建单源**：必先有平台租户、后有 Odoo 公司——故 `pending` 态（意图已落、司未建）
 *   是 saga「先落意图」的持久化承载，孤儿公司降为低频审计项。
 *
 * 本文件只留状态词汇与裁决纯函数；持久化经 `Organization` 自撰域列真列（additive·
 * 同 `status` 列的 BA 共享表纪律），状态推进写路径归 features/odoo-provisioning（切片 C）。
 *
 * @public
 */
import { ORGANIZATION_STATUS, type OrganizationStatus } from './organization-lifecycle';

/**
 * Odoo 公司绑定生命周期状态词汇（值域单源·迁移工件 CHECK 表达式与本声明序同式，
 * wire 内联值集由 `apps/api/src/common/contracts/contracts-vocab-parity.test.ts` 对拍锁漂移）。
 *
 * @remarks
 * `null`（列缺席）= 未绑定，不进本词汇表——与「无状态记录视同 active」的 deny-list 口径同构：
 * 绑定维度的 fail-closed 由 {@link canUseOdoo} 单源裁决，不散点判 null。
 *
 * - `pending`：绑定意图已持久化，尚未开始建司（审批事件落库与 saga 领取之间）；
 * - `provisioning`：建司/本地化基线/用户预配推进中；
 * - `ready`：`odooCompanyId` 有效且公司可用——Odoo 能力的唯一放行态；
 * - `failed`：任一步失败，带 `odooFailureReason`，重试/回找恢复由 doctor 与 saga 承接。
 *
 * @public
 */
export const ORGANIZATION_ODOO_BINDING_STATUS = {
  PENDING: 'pending',
  PROVISIONING: 'provisioning',
  READY: 'ready',
  FAILED: 'failed',
} as const;

/** 绑定状态的字面量联合（自 {@link ORGANIZATION_ODOO_BINDING_STATUS} 派生）。 @public */
export type OrganizationOdooBindingStatus =
  (typeof ORGANIZATION_ODOO_BINDING_STATUS)[keyof typeof ORGANIZATION_ODOO_BINDING_STATUS];

/**
 * {@link canUseOdoo} 的裁决输入（组织行的最小子集·避免依赖 ORM 实体类型）。
 * @public
 */
export interface OdooUsabilityInput {
  /** 租户生命周期态（undefined 视同 active·与 lifecycle deny-list 同口径）。 */
  status?: OrganizationStatus | undefined;
  /** 绑定态（null/undefined = 未绑定）。 */
  odooBindingStatus?: OrganizationOdooBindingStatus | null | undefined;
  /** 绑定的 Odoo 公司 id（平行映射外键·跨库弱引用）。 */
  odooCompanyId?: number | null | undefined;
}

/**
 * Odoo 可用性**单源裁决**：`active`（治理事实）∧ 绑定 `ready`（派生事实）∧ 公司 id 在。
 *
 * @remarks
 * 三点门禁（apps 面板 / SSO 通道 / RPC 域注入）共用本函数，杜绝口径漂移；
 * 「审批通过」不即「Odoo 可用」——建司可能慢/可能失败（vision §4.8 Ⅰ/Ⅲ 的机制表达）。
 * fail-closed：任何维度缺席/中间态一律不可用。
 *
 * @param input - 组织状态与绑定态的最小子集。
 * @returns 可用于访问 Odoo 能力返回 `true`；否则 `false`。
 * @public
 */
export function canUseOdoo(input: OdooUsabilityInput): boolean {
  const orgActive = (input.status ?? ORGANIZATION_STATUS.ACTIVE) === ORGANIZATION_STATUS.ACTIVE;
  return (
    orgActive &&
    input.odooBindingStatus === ORGANIZATION_ODOO_BINDING_STATUS.READY &&
    typeof input.odooCompanyId === 'number'
  );
}

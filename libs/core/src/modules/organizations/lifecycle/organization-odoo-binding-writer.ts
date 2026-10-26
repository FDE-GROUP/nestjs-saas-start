import type { OrganizationOdooBindingStatus } from './organization-odoo-binding';

/**
 * 租户↔Odoo 绑定**状态推进写入端口**（module-org-odoo-company-mapping 切片 C · §9.5.4①B 端口倒置）。
 *
 * @remarks
 * 消费方 = `features/odoo-provisioning`（开通 saga：先落意图→建司→回写/失败）。features 禁 import
 * 其他上下文的 domain/infrastructure（features 隔离铁则），而绑定事实的持久化住 organizations 上下文，
 * 故写端口与 {@link ORGANIZATION_ODOO_BINDING_READER} 同法居 `@core`（published port·沿 ROLE_ASSIGNABILITY_READER
 * 先例），适配由 apps 装配根绑定（organizations 基础设施 Mikro 写面·`MikroOrganizationGovernanceRepository`）。
 *
 * saga 的持久化状态机被拆成本端口三原子动作（每步各自耐久·崩溃可由「先落意图 + 命名回找」恢复）：
 * - {@link OrganizationOdooBindingWriter.beginProvisioning}：审批事件领取即落 `provisioning`（意图持久化·
 *   `pending`→`provisioning`，或失败重试重入），令「方向永远对」——孤儿公司降为低频审计项（§1 单源裁决）；
 * - {@link OrganizationOdooBindingWriter.markReady}：建司/本地化/预配全绿后回写 `ready` + 公司 id/名快照 +
 *   `boundAt`，清失败原因（Odoo 能力唯一放行态·`canUseOdoo` 前置）；
 * - {@link OrganizationOdooBindingWriter.markFailed}：任一步失败置 `failed` + 携原因（doctor/saga 重试承接）。
 *
 * 本端口**不校验公司在 Odoo 侧存在性**（跨库弱引用·正向核验归 doctor），只守 SaaS 侧映射行的状态/快照写入。
 *
 * @public
 */
export const ORGANIZATION_ODOO_BINDING_WRITER = Symbol('ORGANIZATION_ODOO_BINDING_WRITER');

/**
 * {@link OrganizationOdooBindingWriter.markReady} 的回写载荷（建司成功后的公司事实快照）。
 * @public
 */
export interface OrganizationOdooReadyPatch {
  /** 建出/回找命中的 Odoo 公司 id（跨库弱引用）。 */
  odooCompanyId: number;
  /** 公司名快照（denormalize·doctor 可刷新）。 */
  odooCompanyName: string | null;
}

/**
 * 绑定状态推进写入端口（写侧·单点·saga 专用）。
 * @public
 */
export interface OrganizationOdooBindingWriter {
  /**
   * 落「建司意图」：绑定态置 `provisioning`（审批领取/失败重试重入·幂等于目标态）。
   * @param organizationId - 目标租户 id。
   */
  beginProvisioning(organizationId: string): Promise<void>;
  /**
   * 回写就绪：绑定态置 `ready` + 公司 id/名快照 + `boundAt=now`，清失败原因。
   * @param organizationId - 目标租户 id。
   * @param patch - 建司成功的公司事实快照。
   */
  markReady(organizationId: string, patch: OrganizationOdooReadyPatch): Promise<void>;
  /**
   * 置失败：绑定态置 `failed` + 携失败原因（供 doctor/重试 定位·可观测）。
   * @param organizationId - 目标租户 id。
   * @param reason - 失败原因（异常消息·截断由适配负责）。
   */
  markFailed(organizationId: string, reason: string): Promise<void>;
}

/**
 * 绑定推进目标态词汇别名（re-export 便于适配侧引值域单源·不引入新词汇）。
 * @internal
 */
export type { OrganizationOdooBindingStatus };

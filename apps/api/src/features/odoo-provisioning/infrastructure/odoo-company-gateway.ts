/**
 * Odoo 公司开通网关端口（module-org-odoo-company-mapping 切片 C · features/odoo-provisioning 专属区）。
 *
 * @remarks
 * saga 与「Odoo 建司深水区」之间的唯一接缝：saga 只依赖本端口编排状态机（先落意图→回找/建司→本地化→
 * 预配→回写），具体 RPC 落在此端口的适配实现（{@link OdooJsonCompanyGateway}）。单测以替身注入本端口即
 * 可确定性地锁 saga 编排（无活体 Odoo 也能跑），真建司行为的对拍留联调窗（见方案 §5·部署面人签后执行）。
 *
 * 「命名回找」是本端口的核心语义：`findCompanyIdByName` 先按确定性公司名在 Odoo 侧回找——命中即复用其 id
 * （重投/崩溃恢复不重复建司，孤儿公司降为低频审计项），未命中才 `createCompany`。方向永远由「必先有租户、
 * 后有公司」的单源裁决守住（§1）。
 *
 * @public
 */
export const ODOO_COMPANY_GATEWAY = Symbol('ODOO_COMPANY_GATEWAY');

/**
 * 建司网关端口（写侧·saga 专用）。
 * @public
 */
export interface OdooCompanyGateway {
  /**
   * 按确定性公司名在 Odoo 侧回找已存在的公司 id（重投/恢复幂等用）；未命中 → null。
   * @param name - 确定性公司名（由租户 id 派生·可复现）。
   */
  findCompanyIdByName(name: string): Promise<number | null>;
  /**
   * 建 `res.company`（确定性命名）并回其 id。
   * @param name - 公司名。
   * @returns 新建公司的 Odoo id。
   */
  createCompany(name: string): Promise<number>;
  /**
   * 对公司应用本地化基线（时区/币种/语言等）。
   * @param companyId - 目标公司 id。
   */
  applyLocalizationBaseline(companyId: number): Promise<void>;
  /**
   * 预配公司管理员（建/绑定管理用户·纳入 allowed_companies）。
   * @param companyId - 目标公司 id。
   */
  provisionAdministrator(companyId: number): Promise<void>;
}

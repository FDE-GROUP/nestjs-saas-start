import type { TenancyStatus } from './organization-lifecycle';
import type { OrganizationOdooBindingStatus } from './organization-odoo-binding';

/**
 * 租户↔Odoo 绑定读取端口（module-org-odoo-company-mapping 切片 B · §9.5.4①B 端口倒置）。
 *
 * @remarks
 * 消费方 = `features/odoo-rpc-api`（RPC company 域注入前的绑定解析）——features 禁 import
 * 其他上下文的 domain/infrastructure（features 隔离铁则），而绑定事实住 organizations 上下文，
 * 故端口居 `@core`（绑定词汇文件同区的 published port·沿 ROLE_ASSIGNABILITY_READER published
 * 先例），适配由 apps 装配根绑定（organizations 基础设施 Mikro 读面）。
 * `@core` 共享内核含 organizations 领域词汇（`ORGANIZATION_ODOO_BINDING_STATUS` 即住此），
 * 本端口只引用既有词汇、不引入新 Odoo 概念入内核。
 *
 * @public
 */
export const ORGANIZATION_ODOO_BINDING_READER = Symbol('ORGANIZATION_ODOO_BINDING_READER');

/**
 * 按租户读取的 Odoo 绑定行（`canUseOdoo` 裁决输入超集·携治理态）。
 *
 * @remarks
 * `odooBindingStatus=null` = 未绑定（列缺席·存量/演示行即此态）；治理态 `organizationStatus`
 * 缺席时按 deny-list 口径视同 active（`canUseOdoo` 内裁决），本端口不做语义加工。
 *
 * @public
 */
export interface OrganizationOdooBindingRow {
  /** 所属租户 id。 */
  organizationId: string;
  /** 绑定的 Odoo 公司 id（跨库弱引用·无绑定即 null）。 */
  odooCompanyId: number | null;
  /** 绑定生命周期态（null=未绑定）。 */
  odooBindingStatus: OrganizationOdooBindingStatus | null;
  /** 公司名快照。 */
  odooCompanyName: string | null;
  /** 绑定确立时间。 */
  odooBoundAt: Date | null;
  /** 租户治理生命周期态（可选·缺席视同 active）。 */
  organizationStatus?: TenancyStatus;
}

/**
 * 绑定读取端口（只读·单点）。
 * @public
 */
export interface OrganizationOdooBindingReader {
  /**
   * 按租户读取绑定行；租户不存在 → null（调用方按 fail-closed 处置）。
   * @param organizationId - 目标租户 id。
   * @returns 绑定行；租户查无时为 `null`。
   */
  read(organizationId: string): Promise<OrganizationOdooBindingRow | null>;
}

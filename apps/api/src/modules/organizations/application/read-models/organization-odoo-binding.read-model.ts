import type { OrganizationOdooBindingStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';

/**
 * 租户↔Odoo 公司绑定回执的返回形状（CQRS 读侧·module-org-odoo-company-mapping 切片 A）。
 *
 * @remarks
 * 与 domain 端口 `OrganizationOdooBindingRecord` 字段恒等（编译期对拍见
 * `api/response/organization-odoo-binding.response.ts` 与 contracts 视图赋值锁）；
 * 只暴露映射档案——公司实体数据仍走 odoo-rpc-api 域注入面，不经本形状透传。
 * @public
 */
export interface OrganizationOdooBindingReadModel {
  /** 所属租户 id。 */
  organizationId: string;
  /** 绑定的 Odoo 公司 id（跨库弱引用，无 FK）。 */
  odooCompanyId: number;
  /** 绑定生命周期态。 */
  odooBindingStatus: OrganizationOdooBindingStatus;
  /** 公司名快照（denormalize）。 */
  odooCompanyName: string | null;
  /** 绑定确立时间。 */
  odooBoundAt: Date | null;
}

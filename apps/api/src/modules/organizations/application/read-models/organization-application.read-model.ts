/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { TenancyStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';

/**
 * 租户申请/审批流的返回形状（CQRS 读侧）。
 *
 * @remarks
 * Deliberately minimal: the caller only needs the tenant id + its lifecycle status.
 * @public
 */
export interface OrganizationApplicationReadModel {
  /** 所属租户 id。 */
  organizationId: string;
  /** 租户生命周期状态。 */
  status: TenancyStatus;
}

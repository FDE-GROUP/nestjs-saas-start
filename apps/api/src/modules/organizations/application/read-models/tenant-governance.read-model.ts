import type { TenancyStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';

/**
 * 租户生命周期治理返回形状（CQRS 读侧·rehierarchy 片一 治理台改锚 tenant）。
 *
 * @remarks
 * 平台治理台 suspend/resume/delete 的迁移回执：仅 tenant id + 准入态两项。审批权威态归位住 `tenant.status`（切片 E）。
 * @public
 */
export interface TenantGovernanceResult {
  /** 目标租户 id。 */
  tenantId: string;
  /** 迁移后的租户准入态。 */
  status: TenancyStatus;
}

/**
 * 租户硬删连带结果（丁裁：200 + purgedOrgs/purgedEvents 供审计核对）。
 * @public
 */
export interface TenantHardDeleteResult {
  /** 被硬删的 tenant 主键。 */
  tenantId: string;
  /** 本次连带消灭的组织行数（一租多组织）。 */
  purgedOrgs: number;
  /** 本次清除的 lifecycle 事件数。 */
  purgedEvents: number;
}

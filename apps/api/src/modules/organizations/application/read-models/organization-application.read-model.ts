/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';

/**
 * Read-model projection for the tenant application/approval flow (CQRS read side).
 * Deliberately minimal: the caller only needs the tenant id + its lifecycle status.
 */
export interface OrganizationApplicationReadModel {
  organizationId: string;
  status: OrganizationStatus;
}

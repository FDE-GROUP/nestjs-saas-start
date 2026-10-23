import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';

/**
 * Organization provisioning gateway port (domain-owned · global-tenancy S4 · FR-1).
 *
 * 「建租户唯一通道」= 服务端系统动作：申请经 Better Auth `createOrganization`（无 session +
 * `body.userId` → `isSystemAction`，源码坐实不受 `allowUserToCreateOrganization:false` 限）落
 * pending 组织，并落 `tenant` 户籍行为 `pending_approval`（global-tenant-entity-reclamation
 * 切片 B：态存自有表真列，旧 `metadata.status` 寄居已退场）。BA 原生把创建者置为首名
 * `owner` member（FR-12·天然满足），本 port 不另写成员。
 *
 * `remove` 供驳回：硬删 pending 组织行（FK 级联清 member/invitation·pending 期零业务数据）。
 * 状态迁移（approve）不在此 port——由 `OrganizationStatusService` 统一写回户籍表（禁散点）。
 */
export const ORGANIZATION_PROVISIONING_REPOSITORY = Symbol('ORGANIZATION_PROVISIONING_REPOSITORY');

/** 申请落地后的最小回执（组织 id + 当前生命周期状态）。 */
export interface OrganizationProvisioningReceipt {
  organizationId: string;
  status: OrganizationStatus;
}

export interface OrganizationProvisioningRepository {
  /** 以系统动作建 pending 组织；申请人经 BA 成为首名 owner。 */
  submit(userId: string, name: string, slug: string): Promise<OrganizationProvisioningReceipt>;
  /** 删除组织行（驳回 pending 用）；命中返回 true，否则 false。 */
  remove(organizationId: string): Promise<boolean>;
}

import type { OrgVisibility } from '@core/saas-kit/modules/organizations/visibility/org-visibility';
import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { TenantOrgVisibilityResult } from '../read-models/tenant-governance.read-model';

/**
 * 平台级动作（第三次复裁 · 切片 3·D2）：设置租户租内跨组织可见性策略 `tenant.orgVisibility`。
 *
 * @remarks
 * 治理台改锚 tenant：作用于**租内机密维** `orgVisibility`∈{shared,isolated}——`shared` 保持存量互见（零行为变更）、
 * `isolated` 使租内跨组织互不可见（经切片 1 全局 filter 消费）；跨租硬地板 `tenantId` 不受本动作影响。
 * 租户不存在 → null（控制层转 404）。`operatorId` = 会话主体（PlatformOperatorGuard 已裁决平台权），供结构化审计。
 * @public
 */
export class SetTenantOrgVisibilityCommand extends BaseCommand<TenantOrgVisibilityResult | null> {
  constructor(
    readonly tenantId: string,
    readonly orgVisibility: OrgVisibility,
    readonly operatorId: string,
  ) {
    super();
  }
}

import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { TenantGovernanceResult } from '../read-models/tenant-governance.read-model';

/**
 * 平台级动作（FR-11①·FR-6·NFR-6）：经营者**软删**租户 → 迁至 `deleted` 终态（§9.4）。
 *
 * @remarks
 * 治理台改锚 tenant·准入态归位（rehierarchy 片一）：软删作用于**租户准入态** `tenant.status`→deleted，封禁整个租户（其下所有组织随之失能）。
 * 保留行以支持后续按租户数据导出/硬删（GDPR/PIPL 留阶段 3）；中间件 deny-list 即时失能。
 * pending 的即时硬删走 reject 路径；此处对任意非终态租户打 deleted。不存在 → null（404）。
 * @public
 */
export class DeleteOrganizationCommand extends BaseCommand<TenantGovernanceResult | null> {
  constructor(
    readonly tenantId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

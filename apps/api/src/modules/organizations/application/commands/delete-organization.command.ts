import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { OrganizationApplicationReadModel } from '../read-models/organization-application.read-model';

/**
 * 平台级动作（FR-11①·FR-6·NFR-6）：经营者**软删**租户 → 迁至 `deleted` 终态（§9.4）。
 * 保留行以支持后续按租户数据导出/硬删（GDPR/PIPL 留阶段 3）；中间件 deny-list 即时失能。
 * pending 的即时硬删走 reject 路径；此处对任意非终态租户打 deleted。不存在 → null（404）。
 */
export class DeleteOrganizationCommand extends BaseCommand<OrganizationApplicationReadModel | null> {
  constructor(
    readonly organizationId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

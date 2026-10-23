import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { OrganizationDiagnostics } from '../read-models/platform-organization.read-model';

/** 按租户诊断（FR-6·平台级读侧）：租户行 + 关联计数；不存在 → null（404）。 */
export class GetOrganizationDiagnosticsQuery extends BaseQuery<OrganizationDiagnostics | null> {
  constructor(readonly organizationId: string) {
    super();
  }
}

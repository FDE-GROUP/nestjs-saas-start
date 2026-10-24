import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { PlatformOrganizationRow } from '../read-models/platform-organization.read-model';

/**
 * 租户详情查询（FR-6·平台级读侧）：不存在 → null（控制层转 404）。
 * @public
 */
export class GetPlatformOrganizationQuery extends BaseQuery<PlatformOrganizationRow | null> {
  constructor(readonly organizationId: string) {
    super();
  }
}

import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { PlatformTenantDetail } from '../../domain/repositories/organization-governance.repository';

/**
 * 租户详情查询（FR-6·平台级读侧·治理台改锚 tenant）：不存在 → null（控制层转 404）。
 * @public
 */
export class GetPlatformTenantQuery extends BaseQuery<PlatformTenantDetail | null> {
  constructor(readonly tenantId: string) {
    super();
  }
}

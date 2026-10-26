import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { PlatformTenantPage } from '../../domain/repositories/organization-governance.repository';

/**
 * 跨租租户列表查询（FR-6·平台级读侧·治理台改锚 tenant）。
 *
 * @remarks
 * 无租户 arg——平台经营者天然见全量（FR-11①），
 * 访问裁决由 controller 侧 `PlatformOperatorGuard` 前置把守。
 * @public
 */
export class ListPlatformTenantsQuery extends BaseQuery<PlatformTenantPage> {
  constructor(
    readonly limit: number,
    readonly offset: number,
    readonly search?: string,
  ) {
    super();
  }
}

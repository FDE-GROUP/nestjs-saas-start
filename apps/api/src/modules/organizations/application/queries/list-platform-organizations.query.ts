import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { PlatformOrganizationPage } from '../read-models/platform-organization.read-model';

/**
 * 跨租户列表（FR-6·平台级读侧）。无租户 arg——平台经营者天然见全量（FR-11①），
 * 访问裁决由 controller 侧 `PlatformOperatorGuard` 前置把守。
 */
export class ListPlatformOrganizationsQuery extends BaseQuery<PlatformOrganizationPage> {
  constructor(
    readonly limit: number,
    readonly offset: number,
    readonly search?: string,
  ) {
    super();
  }
}

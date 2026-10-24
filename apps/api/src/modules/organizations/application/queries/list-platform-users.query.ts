import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { PlatformUserPage } from '../read-models/platform-user.read-model';

/**
 * 跨平台用户列表查询（FR-6·平台级读侧）。
 *
 * @remarks
 * 无租户 arg——经营者天然见全量（FR-11①），
 * 访问裁决由 controller 侧 `PlatformOperatorGuard` 前置把守。
 * @public
 */
export class ListPlatformUsersQuery extends BaseQuery<PlatformUserPage> {
  constructor(
    readonly limit: number,
    readonly offset: number,
    readonly search?: string,
  ) {
    super();
  }
}

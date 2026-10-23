import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { UserGovernanceResult } from '../read-models/platform-user.read-model';

/**
 * 平台级动作（FR-10/FR-11①·FR-6）：经营者暂停平台用户 → `active → suspended`（§9.4 迁移表），
 * 该用户在**所有租户 + 平台侧**即时失权（session 硬删 + 守卫 deny-list）。非法迁移 → 409；
 * 用户不存在 → null（404）。`operatorId` = 会话主体，供结构化审计（FR-6）。
 */
export class SuspendUserCommand extends BaseCommand<UserGovernanceResult | null> {
  constructor(
    readonly userId: string,
    readonly operatorId: string,
    readonly reason?: string,
  ) {
    super();
  }
}

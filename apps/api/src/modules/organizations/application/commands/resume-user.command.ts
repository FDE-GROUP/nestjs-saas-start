import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { UserGovernanceResult } from '../read-models/platform-user.read-model';

/**
 * 平台级动作（FR-10/FR-6）：经营者恢复被暂停用户 → `suspended → active`。恢复不重建 session
 * （用户须自行重登），仅撤去 deny-list 失能。非法迁移 → 409；用户不存在 → null（404）。
 */
export class ResumeUserCommand extends BaseCommand<UserGovernanceResult | null> {
  constructor(
    readonly userId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

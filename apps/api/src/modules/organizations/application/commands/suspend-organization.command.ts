import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { OrganizationApplicationReadModel } from '../read-models/organization-application.read-model';

/**
 * 平台级动作（FR-11①·FR-6）：经营者暂停生效租户 → `active → suspended`（§9.4 迁移表）。
 *
 * @remarks
 * 中间件 deny-list 即时失能（fail-closed·S4 已就位）。非法迁移 → 409；不存在 → null（404）。
 * `operatorId` = 会话主体，供结构化审计（FR-6）。
 * @public
 */
export class SuspendOrganizationCommand extends BaseCommand<OrganizationApplicationReadModel | null> {
  constructor(
    readonly organizationId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

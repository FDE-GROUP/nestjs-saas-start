import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { OrganizationApplicationReadModel } from '../read-models/organization-application.read-model';

/**
 * 平台级动作（FR-11①·FR-6）：经营者恢复被暂停租户 → `suspended → active`（§9.4 迁移表）。
 *
 * @remarks
 * 非法迁移（如从未暂停）→ 409；不存在 → null（404）。`operatorId` 供结构化审计。
 * @public
 */
export class ResumeOrganizationCommand extends BaseCommand<OrganizationApplicationReadModel | null> {
  constructor(
    readonly organizationId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

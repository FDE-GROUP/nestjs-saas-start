import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { TenantGovernanceResult } from '../read-models/tenant-governance.read-model';

/**
 * 平台级动作（FR-11①·FR-6）：经营者恢复被暂停租户 → `suspended → active`（§9.4 迁移表）。
 *
 * @remarks
 * 治理台改锚 tenant·准入态归位（rehierarchy 片一）：作用于租户准入态 `tenant.status`。
 * 非法迁移（如从未暂停）→ 409；不存在 → null（404）。`operatorId` 供结构化审计。
 * @public
 */
export class ResumeOrganizationCommand extends BaseCommand<TenantGovernanceResult | null> {
  constructor(
    readonly tenantId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

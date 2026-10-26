import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { TenantGovernanceResult } from '../read-models/tenant-governance.read-model';

/**
 * 平台级动作（FR-11①·FR-6）：经营者暂停生效租户 → `active → suspended`（§9.4 迁移表）。
 *
 * @remarks
 * 治理台改锚 tenant·准入态归位（rehierarchy 片一）：作用于**租户准入态** `tenant.status`（其下所有组织随中间件 deny-list 失能）。
 * 中间件 deny-list 即时失能（fail-closed·S4 已就位）。非法迁移 → 409；不存在 → null（404）。
 * `operatorId` = 会话主体，供结构化审计（FR-6）。
 * @public
 */
export class SuspendOrganizationCommand extends BaseCommand<TenantGovernanceResult | null> {
  constructor(
    readonly tenantId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

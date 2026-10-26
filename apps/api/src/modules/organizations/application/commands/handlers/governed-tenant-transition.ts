import type { TenancyStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException } from '@nestjs/common';
import type { TenantGovernanceResult } from '../../read-models/tenant-governance.read-model';

/**
 * 租户治理迁移动作名（suspend/resume·approve 仍走 org 申请用例·hard_delete 独立用例不走本函数）。
 * @public
 */
export type GovernedTenantTransitionAction = 'suspend' | 'resume';

/**
 * 最小依赖面（结构性类型·便于单测 stub）。
 * @public
 */
export interface GovernedTenantTransitionDeps {
  /** 租户治理状态服务端口依赖（准入态权威住 `tenant.status`·rehierarchy 切片 E-F 换轴归位）。 */
  readonly status: Pick<TenantStatusService, 'transition'>;
  /** 审计服务依赖（写治理审计行用）。 */
  readonly audit: Pick<PlatformAuditService, 'logOrganizationGovernance'>;
}

/**
 * 租户治理迁移共用用例的入参（动作名 + 目标租户 + 操作者 + 目标态）。
 * @public
 */
export interface GovernedTenantTransitionInput {
  /** 授权动作。 */
  readonly action: GovernedTenantTransitionAction;
  /** 目标租户 id（治理台改锚 tenant·非组织 id）。 */
  readonly tenantId: string;
  /** 操作者 id（会话主体·审计用）。 */
  readonly operatorId: string;
  /** 迁移目标态。 */
  readonly target: TenancyStatus;
}

/**
 * 租户治理迁移**共用用例**（rehierarchy 片一 治理台改锚 tenant）：suspend/resume 两 handler 的样板收敛单点。
 *
 * @remarks
 * 语义逐字对齐旧 `governedOrganizationTransition`，惟锚从 organizationId 换 **tenantId**（companion org 不再误判
 * `tenantExists(orgId)=false → 404`）：
 * - `not-found` → `null`（控制层转 404）；
 * - `illegal` → 结构化审计（error: 'illegal_transition'）+ 409 `ORG_ILLEGAL_TRANSITION`；
 * - `ok` → 结构化审计（from/to）+ 返回 `{tenantId, status}`。
 * @param deps - 最小依赖面（状态服务 + 审计服务）。
 * @param input - 迁移入参。
 * @returns 迁移后租户治理回执；租户查无为 `null`。
 *
 * @throws {ConflictException} 租户生命周期迁移非法时。
 * @public
 */
export async function governedTenantTransition(
  deps: GovernedTenantTransitionDeps,
  input: GovernedTenantTransitionInput,
): Promise<TenantGovernanceResult | null> {
  const result = await deps.status.transition(input.tenantId, input.target, {
    actorId: input.operatorId,
  });
  if (result.kind === 'not-found') return null;
  if (result.kind === 'illegal') {
    await deps.audit.logOrganizationGovernance(input.action, input.tenantId, input.operatorId, {
      from: result.from,
      to: result.to,
      error: 'illegal_transition',
    });
    throw new ConflictException(
      `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
      { errorCode: ERROR_CODES.ORG_ILLEGAL_TRANSITION },
    );
  }
  await deps.audit.logOrganizationGovernance(input.action, input.tenantId, input.operatorId, {
    from: result.previous,
    to: result.status,
  });
  return { tenantId: input.tenantId, status: result.status };
}

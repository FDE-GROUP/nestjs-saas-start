import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException } from '@nestjs/common';
import type { OrganizationApplicationReadModel } from '../../read-models/organization-application.read-model';

/**
 * 治理迁移动作名（approve/suspend/resume；hard_delete 是独立用例不走本函数）。
 * @public
 */
export type GovernedTransitionAction = 'approve' | 'suspend' | 'resume';

/**
 * 最小依赖面（结构性类型·便于单测 stub）。
 * @public
 */
export interface GovernedTransitionDeps {
  readonly status: Pick<OrganizationStatusService, 'transition'>;
  readonly audit: Pick<PlatformAuditService, 'logOrganizationGovernance'>;
}

/**
 * 治理迁移共用用例的入参（动作名 + 目标租户 + 操作者 + 目标态）。
 * @public
 */
export interface GovernedTransitionInput {
  readonly action: GovernedTransitionAction;
  readonly organizationId: string;
  readonly operatorId: string;
  readonly target: OrganizationStatus;
}

/**
 * 治理迁移**共用用例**（架构精度修宪 S4）：approve/suspend/resume 三 handler 的样板收敛单点。
 *
 * @remarks
 * 三个 handler 原为同一
 * `result.kind` 三分支样板 ×3（仅动作名与目标状态不同），收敛至此单点。
 *
 * 语义与原逐 handler 实现逐字一致：
 * - `not-found` → `null`（控制层转 404）；
 * - `illegal` → 结构化审计（error: 'illegal_transition'）+ 409 `ORG_ILLEGAL_TRANSITION`
 *   （HTTP 翻译留在 application 层——P1 允许面）；
 * - `ok` → 结构化审计（from/to）+ 返回读模型。
 *
 * 行为锁：既有 handler 测试（approve/suspend/resume 三分支持续全绿）+ 状态机矩阵测试。
 * @param deps - 最小依赖面（状态服务 + 审计服务）。
 * @param input - 迁移入参。
 * @returns 迁移后读模型；租户查无为 `null`。
 * @public
 */
export async function governedOrganizationTransition(
  deps: GovernedTransitionDeps,
  input: GovernedTransitionInput,
): Promise<OrganizationApplicationReadModel | null> {
  const result = await deps.status.transition(input.organizationId, input.target, {
    actorId: input.operatorId,
  });
  if (result.kind === 'not-found') return null;
  if (result.kind === 'illegal') {
    await deps.audit.logOrganizationGovernance(
      input.action,
      input.organizationId,
      input.operatorId,
      {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      },
    );
    throw new ConflictException(
      `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
      { errorCode: ERROR_CODES.ORG_ILLEGAL_TRANSITION },
    );
  }
  await deps.audit.logOrganizationGovernance(input.action, input.organizationId, input.operatorId, {
    from: result.previous,
    to: result.status,
  });
  return { organizationId: input.organizationId, status: result.status };
}

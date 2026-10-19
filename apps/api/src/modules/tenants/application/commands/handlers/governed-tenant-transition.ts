import type { TenantStatus } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { TenantStatusService } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException } from '@nestjs/common';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';

/** 审计动作名（approve/suspend/resume；hard_delete 是独立用例不走本函数）。 */
export type GovernedTransitionAction = 'approve' | 'suspend' | 'resume';

/** 最小依赖面（结构性类型·便于单测 stub）。 */
export interface GovernedTransitionDeps {
  readonly status: Pick<TenantStatusService, 'transition'>;
  readonly audit: Pick<PlatformAuditService, 'logTenantGovernance'>;
}

export interface GovernedTransitionInput {
  readonly action: GovernedTransitionAction;
  readonly organizationId: string;
  readonly operatorId: string | undefined;
  readonly target: TenantStatus;
}

/**
 * 治理迁移**共用用例**（架构精度修宪 S4）：approve/suspend/resume 三个 handler 原为同一
 * `result.kind` 三分支样板 ×3（仅动作名与目标状态不同），收敛至此单点。
 *
 * 语义与原逐 handler 实现逐字一致：
 * - `not-found` → `null`（控制层转 404）；
 * - `illegal` → 结构化审计（error: 'illegal_transition'）+ 409 `TENANCY_ILLEGAL_TRANSITION`
 *   （HTTP 翻译留在 application 层——P1 允许面）；
 * - `ok` → 结构化审计（from/to）+ 返回读模型。
 *
 * 行为锁：既有 handler 测试（approve/suspend/resume 三分支持续全绿）+ 状态机矩阵测试。
 */
export async function governedTenantTransition(
  deps: GovernedTransitionDeps,
  input: GovernedTransitionInput,
): Promise<TenantApplicationReadModel | null> {
  const result = await deps.status.transition(input.organizationId, input.target, {
    actorId: input.operatorId,
  });
  if (result.kind === 'not-found') return null;
  if (result.kind === 'illegal') {
    deps.audit.logTenantGovernance(input.action, input.organizationId, input.operatorId, {
      from: result.from,
      to: result.to,
      error: 'illegal_transition',
    });
    throw new ConflictException(
      `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
      { errorCode: ERROR_CODES.TENANCY_ILLEGAL_TRANSITION },
    );
  }
  deps.audit.logTenantGovernance(input.action, input.organizationId, input.operatorId, {
    from: result.previous,
    to: result.status,
  });
  return { organizationId: input.organizationId, status: result.status };
}

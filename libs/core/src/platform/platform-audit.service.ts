import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OrganizationStatus } from '../modules/organizations/lifecycle/organization-lifecycle';
import { AUDIT_LOG_STORE, type AuditLogStore } from '../shared-kernel/audit/audit-log.store';
import { currentRequestId } from '../shared-kernel/context/request-context';

/**
 * 平台级治理动作（FR-6 · S4/S5）：审批/驳回 + 暂停/恢复/删除。
 *
 * @public
 */
export type PlatformOrganizationAction =
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'resume'
  | 'delete'
  | 'hard_delete';

/**
 * 平台级用户治理动作（FR-6/FR-10 · S6）：暂停/恢复/删除平台用户。
 *
 * @public
 */
export type PlatformUserAction = 'suspend' | 'resume' | 'delete';

/**
 * 治理动作审计明细（既有结构化日志字段 + 可选治理理由）。
 *
 * @remarks
 * `error` 携失败上下文（如非法迁移被拒/未终态）——**判别子**：带 `error` 即「未落库的尝试」，
 * 只进 pino 观测流、不入耐久账本（无状态变更可留痕）；无 `error` 即「已提交动作」，同步落 `audit_log`。
 *
 * @public
 */
export interface GovernanceAuditDetail {
  /** 迁移前的原状态。 */
  readonly from?: OrganizationStatus;
  /** 迁移后的目标状态。 */
  readonly to?: OrganizationStatus;
  /** 错误信息。 */
  readonly error?: string;
  /** 治理迁移原因（审计记录）。 */
  readonly reason?: string;
}

/**
 * 平台治理审计单点（FR-6 · S5 · 全局唯一卡点）：跨租户/用户治理动作的**唯一**审计出口。
 *
 * @remarks
 * 所有 approve/reject/suspend/resume/delete/hard_delete 均经此，禁 handler 散点手搓 logger.info。
 *
 * 双通道（global-governance-lifecycle-consolidation 切片 E·约束③「另立显式 audit_log 表」）：
 *  - **pino 结构化日志**（S5 原口径·实时观测流·库外幸存）——所有调用（含失败尝试）恒发；
 *  - **`audit_log` 耐久账本**（本片新增·经 `AUDIT_LOG_STORE` 端口落 tenants 属主）——仅「已提交动作」
 *    （`detail.error` 为空）落账，PII 最小化（只携 id·不携邮箱）。
 * S5 旧注「不落新表 → 后续如需查询/导出再演进专用审计表」即本片所演进之专用审计表。
 *
 * @public
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入（Symbol 端口）。
    @Inject(AUDIT_LOG_STORE) private readonly auditLog: AuditLogStore,
  ) {}

  /**
   * 记录一次租户治理动作；`error` 携失败上下文（如非法迁移被拒·此时不入耐久账本仅观测）。
   *
   * @param action - 治理动作类型
   * @param organizationId - 被治理租户 id
   * @param operatorId - 执行操作者 id
   * @param detail - 可选审计明细（迁移端点/理由/失败上下文）
   * @returns 落审计通道完成后 resolve
   */
  async logOrganizationGovernance(
    action: PlatformOrganizationAction,
    organizationId: string,
    operatorId: string,
    detail?: GovernanceAuditDetail,
  ): Promise<void> {
    this.logger.log({
      audit: 'platform.tenant',
      action,
      organizationId,
      operatorId,
      from: detail?.from,
      to: detail?.to,
      error: detail?.error,
      at: new Date().toISOString(),
    });
    // 已提交动作（无 error）→ 落耐久账本（PII 最小化·仅 id + 动作 + 迁移端点）。
    if (detail?.error) return;
    await this.auditLog.append({
      entityType: 'tenant',
      entityId: organizationId,
      action,
      from: detail?.from ?? null,
      to: detail?.to ?? null,
      actorId: operatorId,
      reason: detail?.reason ?? null,
      correlationId: currentRequestId(),
    });
  }

  /**
   * 记录一次用户治理动作（FR-6/FR-10 · S6）：与租户治理同构的双通道审计单点。
   *
   * @remarks
   * subject 为被治理用户 id；`error` 携失败上下文（此时仅观测·不入账）。禁散点手搓。
   *
   * @param action - 治理动作类型
   * @param userId - 被治理用户 id
   * @param operatorId - 执行操作者 id
   * @param detail - 可选审计明细（迁移端点/理由/失败上下文）
   * @returns 落审计通道完成后 resolve
   */
  async logUserGovernance(
    action: PlatformUserAction,
    userId: string,
    operatorId: string,
    detail?: GovernanceAuditDetail,
  ): Promise<void> {
    this.logger.log({
      audit: 'platform.user',
      action,
      userId,
      operatorId,
      from: detail?.from,
      to: detail?.to,
      error: detail?.error,
      at: new Date().toISOString(),
    });
    if (detail?.error) return;
    await this.auditLog.append({
      entityType: 'user',
      entityId: userId,
      action,
      from: detail?.from ?? null,
      to: detail?.to ?? null,
      actorId: operatorId,
      reason: detail?.reason ?? null,
      correlationId: currentRequestId(),
    });
  }
}

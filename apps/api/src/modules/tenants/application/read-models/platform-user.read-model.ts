/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { UserStatus } from '@core/saas-kit/modules/tenants/lifecycle/user-status.service';

/**
 * Platform user-governance read-model projections (FR-6/FR-10 · S6 · CQRS read side).
 * List shapes are owned by the domain port; this re-exports them for application/controller
 * consumption. The write side (suspend/resume) returns a minimal `UserGovernanceResult`.
 * Cross-platform by design — the operator sees every user; these shapes must never leak
 * into tenant-scoped slices.
 */
export type { PlatformUserPage } from '../../domain/repositories/user-governance.repository';

/** suspend/resume 迁移成功后的最小回执（供 controller 返回·status 为新态）。 */
export interface UserGovernanceResult {
  userId: string;
  status: UserStatus;
}

import type { UserStatus } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { Page, PageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';

/**
 * Platform user-governance repository port (domain-owned · global-tenancy S6 · FR-6/FR-10).
 *
 * 跨平台用户运营视图的读侧卡点：仅经 `PlatformOperatorGuard` 裁决后的平台级列表使用——
 * **刻意不做租户过滤**（平台级天然全量，FR-11①）。用户暂停态存独立表 `user_status`，
 * 无记录行视同 active（与租户 deny-list 同口径）。
 *
 * 状态迁移（suspend/resume/delete）不在此 port——统一走 `UserStatusService.transition`
 * （`user_status` 单点·复用 §9.4 迁移表）；session 硬删由治理 handler 直接经旧 ORM 叠加。
 */
export const USER_GOVERNANCE_REPOSITORY = Symbol('USER_GOVERNANCE_REPOSITORY');

export interface PlatformUserRow {
  userId: string;
  name: string;
  email: string;
  /** 无 user_status 记录行（存量/未被动过）视同 active。 */
  status: UserStatus;
  createdAt: Date;
}

/** 分页形状收敛到 shared-kernel 泛型契约（乙裁：旧名留作别名，消费方不动）。 */
export type PlatformUserPage = Page<PlatformUserRow>;

export interface UserGovernanceRepository {
  /** 跨平台用户列表（name/email 模糊过滤·createdAt 倒序·limit/offset 分页）。 */
  list(opts: PageRequest & { search?: string }): Promise<PlatformUserPage>;
}

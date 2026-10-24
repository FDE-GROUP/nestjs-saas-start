/**
 * 配额存储端口的 DI 注入 token（global-tenancy S10 · §9.5.4①B 端口倒置）。
 *
 * @remarks
 * `QuotaService` 是租户座位配额读写的唯一卡点（S7 · FR-7），但 core 侧不应感知
 * `organization_subscription`/`member` 表与旧实现。此端口只暴露两个持久化原语：取当前生效
 * 订阅视图、数成员；档位回落/超限裁决等逻辑留在 core（`tenant-plans` + `QuotaService`）。
 *
 * @public
 */
export const QUOTA_STORE = Symbol('QUOTA_STORE');

/**
 * 当前生效订阅的配额视图（缺行由 core 回落 `FREE_PLAN`·端口只返 null）。
 *
 * @public
 */
export interface ActiveSubscriptionView {
  readonly plan: string;
  readonly seatsLimit: number;
  readonly providerCustomerId: string | null;
}

/**
 * 配额存储端口：取当前生效订阅视图 + 数成员两原语。
 *
 * @public
 */
export interface QuotaStore {
  /**
   * 最新 active 订阅行（by periodStart desc）；无 → `null`。
   *
   * @param organizationId - 目标租户 id
   * @returns 生效订阅视图；无 active 行返回 `null`
   */
  currentActiveSubscription(organizationId: string): Promise<ActiveSubscriptionView | null>;
  /**
   * 该租户成员数（`COUNT(member where organizationId)`）。
   *
   * @param organizationId - 目标租户 id
   * @returns 成员数量
   */
  countMembers(organizationId: string): Promise<number>;
}

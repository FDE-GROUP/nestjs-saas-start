/**
 * 配额存储端口的 DI 注入 token（global-tenancy S10 · §9.5.4①B 端口倒置）。
 *
 * @remarks
 * `QuotaService` 是租户座位配额读写的唯一卡点（S7 · FR-7），但 core 侧不应感知
 * `tenant_subscription`/`member` 表与旧实现。此端口只暴露两个持久化原语：取当前生效
 * 订阅视图、数成员；档位回落/超限裁决等逻辑留在 core（`tenant-plans` + `QuotaService`）。
 *
 * global-tenant-organization-rehierarchy 切片 D（计费单位上移）：配额锥从 `organizationId` 升 **`tenantId`**——
 * 席位/配额按租户总量聚合（member 按 tenantId 计数）。
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
  /** 套餐档位标识。 */
  readonly plan: string;
  /** 席位数上限。 */
  readonly seatsLimit: number;
  /** 支付提供方侧客户 id。 */
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
   * @param tenantId - 目标租户 id（计费主轴）
   * @returns 生效订阅视图；无 active 行返回 `null`
   */
  currentActiveSubscription(tenantId: string): Promise<ActiveSubscriptionView | null>;
  /**
   * 该租户成员数（X7 R2 换锚·global-role-membership-tenantization 切片 D：读自有租级成员 SSOT
   * `tenant_membership` live count）。一租多组织下席位数 = 租内租成员总量（不再读物化列 `tenant.memberCount`/BA member
   * 轴——否则新邀请入租者不计→超卖）。
   *
   * @param tenantId - 目标租户 id（计费主轴）
   * @returns 成员数量
   */
  countMembers(tenantId: string): Promise<number>;
  /**
   * 联表实数（**BA 轴过渡观测原语**·非热路径·非席位真相）：经 `organization.tenantId → member` 两跳
   * 联表求 BA 成员总数，供 member-count-doctor 对拍遗留脏写（其存废随 X8 契约段裁定）。
   *
   * @param tenantId - 目标租户 id（计费主轴）
   * @returns 联表实数成员数量
   */
  reconcileMembers(tenantId: string): Promise<number>;
}

import type { SubscriptionStatus } from '../quota/tenant-plans';

/**
 * 订阅治理生命周期状态机（ES R4 第二上下文推广 · module-es-r4-second-context-subscriptions）。
 * 纯函数·零框架依赖（沿 tenants `organization-lifecycle.ts` 先例·裁①乙不复活聚合管道）。
 *
 * 状态真相源化后（R4c）读侧裁决形态 = `replaySubscriptionLifecycle` fold 的重放态；
 * 本件只留纯态判定 + 合法迁移表（裁ⓑ·人 2026-10-21 按推荐档签发）。
 *
 * 态值单源对齐 quota 面既有 `SubscriptionStatus`（`../quota/tenant-plans.ts:17`·此处不重定义
 * 联合类型，`satisfies` 锁值集不逸出）；contracts 侧 wire enum 一致性由对拍测锁漂移。
 */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, SubscriptionStatus>;

/** 订阅治理态（等价 `SubscriptionStatus`·单源不重掷）。 */
export type { SubscriptionStatus };

/**
 * 合法迁移表（裁ⓑ推荐档·人签发）：
 * - active    → suspended（治理暂停）/ expired（周期到期）/ cancelled（取消）
 * - suspended → active（恢复）/ expired / cancelled
 * - expired / cancelled → 终态（不接受任何迁移）
 * 无状态记录（空流起点）按 active 对待（与 tenants `from ?? ACTIVE` 同口径）。
 * 注：`convergeStatus` 语义为「最新 from 态行 → to」·from 恒为该行现态·自反迁移（from===to）
 * 在真相源 fold 中由 `from !== 重放态` 漂移校验拦截，不在此表放行。
 */
const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  [SUBSCRIPTION_STATUS.ACTIVE]: [
    SUBSCRIPTION_STATUS.SUSPENDED,
    SUBSCRIPTION_STATUS.EXPIRED,
    SUBSCRIPTION_STATUS.CANCELLED,
  ],
  [SUBSCRIPTION_STATUS.SUSPENDED]: [
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.EXPIRED,
    SUBSCRIPTION_STATUS.CANCELLED,
  ],
  [SUBSCRIPTION_STATUS.EXPIRED]: [],
  [SUBSCRIPTION_STATUS.CANCELLED]: [],
};

/** 迁移是否合法（from 缺省视同 active·终态 expired/cancelled 不接受任何迁移）。 */
export function canTransition(
  from: SubscriptionStatus | undefined,
  to: SubscriptionStatus,
): boolean {
  return TRANSITIONS[from ?? SUBSCRIPTION_STATUS.ACTIVE].includes(to);
}

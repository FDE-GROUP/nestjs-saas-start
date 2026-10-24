/**
 * S7 · FR-7/FR-8/D5 订阅档位与配额常量（纯值·无 IO）。
 * 架构精度修宪 S2：seatsLimit 经 Quota VO 携带非负整数不变量（常量定义期即防护）。
 *
 * 配额值来自 Plan（§147）：每档位携带 `seatsLimit`（本片唯一落地维度），
 * `storageQuota`/`apiQuota` 为后续维度占位。订阅行也各自携带 `seatsLimit`
 * 快照（存于 `organization_subscription`·改档不改历史）。无 active 订阅行时回落
 * `FREE_PLAN`（带限额·非 fail-open·裁②）。
 */
import { Quota } from './quota.vo';

/**
 * 订阅状态联合类型（单源定义·1:N 历史的行态；"当前订阅" = 最新 active 行）。
 *
 * @remarks
 * `suspended`：治理挂起的可恢复关闭（module-es-first-real-consumer 裁点丙·租户被 suspend ⇒ 当前行置
 * suspended，resume 回 active）；与 `cancelled`（不可逆终止·恢复新开行）并存不冲突。
 * quota 读面仅滤 `ACTIVE`，suspended/expired/cancelled 自然排除→回落 FREE_PLAN。
 *
 * @public
 */
export type SubscriptionStatus = 'active' | 'suspended' | 'expired' | 'cancelled';

/**
 * 订阅状态词汇（与 `SubscriptionStatus` 联合值对齐·供跨上下文引用）。
 *
 * @public
 */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

/**
 * 组织档位定义（seats 经 Quota VO·storage/api 为占位维度）。
 *
 * @public
 */
export interface OrganizationPlan {
  readonly plan: string;
  /** 座位限额（P2 · Quota VO·非负安全整数不变量）；storage/api 为占位维度仍裸 number。 */
  readonly seatsLimit: Quota;
  readonly storageQuota?: number;
  readonly apiQuota?: number;
}

/**
 * 免费默认档：租户无 active 订阅时的回落（带 seats 限额·裁②）。
 *
 * @public
 */
export const FREE_PLAN: OrganizationPlan = { plan: 'free', seatsLimit: Quota.of(5) };

/**
 * 档位目录（provisioning 缺省限额来源·可扩展）。
 *
 * @public
 */
export const ORGANIZATION_PLANS: Record<string, OrganizationPlan> = {
  [FREE_PLAN.plan]: FREE_PLAN,
  pro: { plan: 'pro', seatsLimit: Quota.of(50) },
  enterprise: { plan: 'enterprise', seatsLimit: Quota.of(Number.MAX_SAFE_INTEGER) },
};

/**
 * 取档位定义（未知档位回落免费档）。
 *
 * @param plan - 档位标识（可为 undefined）
 * @returns 命中的档位定义；未知/缺省返回 `FREE_PLAN`
 * @public
 */
export function resolvePlanDef(plan: string | undefined): OrganizationPlan {
  return (plan && ORGANIZATION_PLANS[plan]) || FREE_PLAN;
}

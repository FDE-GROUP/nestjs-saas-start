import { SetMetadata } from '@nestjs/common';

/**
 * 配额元数据键（`@Quota()` 声明、`QuotaGuard` 读回·单一声明点·禁散点）。
 *
 * @public
 */
export const QUOTA_KEY = Symbol('quota');

/**
 * 路由声明的配额需求（本片落地 seats·其它维度留后续扩展）。
 *
 * @public
 */
export interface QuotaRequirement {
  /** 本次操作预计新增的成员数（默认 1）。 */
  readonly seats?: number;
}

/**
 * 声明某写路径消耗多少座位配额（S7 · FR-7）。
 *
 * @remarks
 * 由 `QuotaGuard` 读回并对照生效订阅限额裁决，超限 402 拒绝。逐路由 opt-in（`@UseGuards(QuotaGuard)` +
 * `@Quota({ seats: 1 })`），不升级为全局 APP_GUARD（高危#4 挂账）。
 *
 * @param requirement - 配额需求（seats 等）
 * @returns 挂 QUOTA_KEY 元数据的 Nest 路由装饰器
 *
 * @example `@Quota({ seats: 1 })`
 *
 * @public
 */
export const Quota = (requirement: QuotaRequirement) => SetMetadata(QUOTA_KEY, requirement);

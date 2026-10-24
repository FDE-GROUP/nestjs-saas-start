import type { SubscriptionStatus } from '../../quota/organization-plans';

/**
 * 订阅生命周期治理联动端口的 DI 注入 token（系统面）。
 *
 * @remarks
 * 订阅生命周期的**治理联动端口**（系统面 · module-es-first-real-consumer 治理档）。
 *
 * 与用户面 `SubscriptionRepository` 的关键区别：后者不暴露 organizationId（所属租户由 adapter 从请求
 * ALS `requireActiveOrganizationId()` fail-closed 盖章·FR-5 隔离卡点）；本端口的调用方是**平台治理事件消费者**
 * （跨上下文经领域事件驱动），不在任何目标租户的请求上下文里——organizationId 显式传参且来源为治理卡点
 * 产出的事件行 `aggregateId`（可信单源），与 `QuotaStore`（tenancy 系统面·显式 organizationId）同侧同律。
 *
 * **幂等契约（at-least-once 硬要求的兑现面）**：终态收敛式——仅当该租户存在最新 `from` 态行时
 * 将其置为 `to` 态；无 `from` 行即零写返回 `false`。同事件重投、乱序滞后均收敛至同一终态，
 * 绝不按事件计数变更。
 *
 * @public
 */
export const SUBSCRIPTION_LIFECYCLE = Symbol('SUBSCRIPTION_LIFECYCLE');

/**
 * 订阅治理联动端口：把某租户最新 `from` 态订阅行终态收敛为 `to` 态。
 *
 * @public
 */
export interface SubscriptionLifecycle {
  /**
   * 把租户最新一条 `from` 态订阅行收敛为 `to` 态；返回是否发生写。
   *
   * @param organizationId - 目标租户 id（治理事件 aggregateId·可信单源）
   * @param from - 前置态
   * @param to - 目标态
   * @returns 发生写返回 `true`；无 `from` 行零写返回 `false`
   */
  convergeStatus(
    organizationId: string,
    from: SubscriptionStatus,
    to: SubscriptionStatus,
  ): Promise<boolean>;
}

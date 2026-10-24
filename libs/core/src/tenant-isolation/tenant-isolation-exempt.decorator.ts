import { SetMetadata } from '@nestjs/common';

/**
 * 元数据键：`@TenantIsolationExempt()` 声明、全局 `TenantIsolationGuard`（S11 · 高危#4 复合全局）经 `Reflector` 读回。
 *
 * @remarks
 * 与 `IS_PUBLIC_KEY`/`QUOTA_KEY`/`CAN_KEY` 同构——单一声明点，禁散点特判。
 *
 * @public
 */
export const IS_TENANT_ISOLATION_EXEMPT_KEY = Symbol('isTenantIsolationExempt');

/**
 * 显式声明某路由**豁免全局租户墙、但仍受全局会话墙保护**（S11 · FR-5/FR-11 复合全局）。
 *
 * @remarks
 * 真·复合全局形态下 `TenantIsolationGuard` 经 `APP_GUARD` 全局化（deny-by-default）：所有路由默认
 * 要求已绑定 active 租户上下文，未豁免者一律 403。但一批**已认证却合法无租户**的流本就不该带
 * 租户上下文——建租申请（此刻尚无 active 组织·鸡生蛋）、跨租平台治理、个人 PIPL 端点、用户级
 * storage/payment（不经租户仓储 `requireActiveOrganizationId`）。这些路由标注本装饰器跳过租户墙，登录仍必需。
 *
 * 语义正交于 `@Public()`：`@Public`=完全公开（无会话·无租户），`@TenantIsolationExempt`=需会话但不需租户。
 * 全局 `TenantIsolationGuard` 对二者皆旁路（`@Public` 蕴含无租户）；漏标=合法无租户流被 403 死锁，
 * 滥用=租户隔离旁路缺口。故每一处 `@TenantIsolationExempt()` 都是需审计的显式决定。
 *
 * @returns 挂 `IS_TENANT_ISOLATION_EXEMPT_KEY` 元数据的 Nest 路由装饰器
 * @example 类级：`@TenantIsolationExempt()` 于 `OrganizationsController`（建租/审批皆跨租或无租户态）。
 * @public
 */
export const TenantIsolationExempt = () => SetMetadata(IS_TENANT_ISOLATION_EXEMPT_KEY, true);

import { SetMetadata } from '@nestjs/common';

/**
 * 元数据键：`@Public()` 声明、全局 `SessionGuard`（S11 · 高危#4 收口）经 `Reflector` 读回。
 * 与 `QUOTA_KEY`/`CAN_KEY` 同构——单一声明点，禁散点特判。
 */
export const IS_PUBLIC_KEY = Symbol('isPublic');

/**
 * 显式声明某路由**豁免全局会话墙**（S11 · FR-11 全局 APP_GUARD）。
 *
 * 全局 `SessionGuard` 采 deny-by-default：所有路由默认要求已登录会话，未标注者一律 401。
 * 仅真正公共的基础设施端点可标注本装饰器——认证面自身（`/better-auth/*`，否则登录前无法
 * 取会话=鸡生蛋死锁）、以及靠**签名**而非会话校验的入站回调（如 Stripe `payment/webhooks`）。
 * 漏标=公共端点被锁死（生产中断）；滥用=安全缺口。故每一处 `@Public()` 都是需审计的显式决定。
 *
 * @example 类级：`@Public()` 于 `HealthController`；方法级：`@Public()` 于 webhook handler。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

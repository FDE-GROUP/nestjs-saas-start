import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
// S9 铁律：ThrottlerGuard 经 useClass 运行时实例化，必须值导入（import type 会擦除元数据）。
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

/**
 * 请求限流全局墙（module-common-rate-limit·甲裁）：Nest 路由面 deny-by-default，
 * 窗值丙裁 **300 次/60s·IP 宽档**（throttler v6 ttl 单位毫秒；主挡脚本级洪水，
 * 几乎不误伤重前端并发拉取）。执行序 = 本墙（最廉价拒绝）→ 会话墙 401（AuthModule）
 * → 租户墙 403（TenantIsolationModule），故 AppModule imports 必须排在 AuthModule 之前。
 *
 * 边界（与 BA「各护各面」）：`/api/v1/auth/*` 是 Fastify 实例级通配路由
 * （AuthBootstrapService `all()` 接线），不经 Nest 守卫链——认证面由 BA 自有
 * rateLimit（3次/10s·module-auth-ip-trust 信任链）护，本墙零重叠零波及。
 * 客户端 IP 分桶经 main.ts `buildFastifyHttpOptions` 的 trustProxy 与 BA **同源**
 * （同一 AUTH_TRUSTED_PROXIES·乙裁）。豁免面：health 探针类级 `@SkipThrottle()`
 * （探活/CI verify-prod-boot 不得被锁）；邀请/导出等昂贵面逐端点 `@Throttle` 收紧
 * 为缓账（丙裁只签全局宽档·数值未裁不臆测）。
 */

/** 全局窗值单源（丙裁落案·锁测锚点）：60s 内每 IP 每端点 300 次。 */
export const RATE_LIMIT_DEFAULT = { ttl: 60_000, limit: 300 } as const;

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ...RATE_LIMIT_DEFAULT }] })],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}

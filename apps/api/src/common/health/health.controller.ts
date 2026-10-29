import { Public } from '@core/saas-kit/tenant-isolation/public.decorator';
import { Controller } from '@nestjs/common';
// S9 铁律：HealthCheckService 为构造函数注入的类，必须值导入（import type 会擦除 design:paramtypes）
import { HealthCheckService } from '@nestjs/terminus';
// 限流豁免（module-common-rate-limit 甲裁）：探活/CI verify-prod-boot 不得被锁。
import { SkipThrottle } from '@nestjs/throttler';
import { Impl } from '@orpc/nest';
import { healthContract, healthProcedureContract } from '@saas/api-contract/index';
import { os } from '../orpc/orpc';

// 契约定义已前置 `@saas/api-contract` 单源（换轨 WP-E/#2·B 契约先行）；此处 re-export 保下游
// （`AppRouterContract`/覆盖测）经 controller 命名空间拿到的仍是同一 `ProcedureContract` 物体。
export { healthContract, healthProcedureContract };

/** ping-only 委托（与探针端点解耦·可单测）：空指示器数组 = terminus PingHealthIndicator 等价物。 */
export function pingOnly(health: HealthCheckService) {
  return health.check([]);
}

/**
 * 存活探针（oRPC 换轨 WP-A 竖切）：`/api/v1/health` 经 `@orpc/nest` `@Impl` 挂载 oRPC router——
 * contract 的 `openapi.path`（相对段 `/health`）与 Nest 全局前缀（`api`）+ URI 版本化（`v1`）
 * 合成最终路径，与旧 REST 面**逐字节一致**（真实 app 起服实测 `/api/v1/health` 200 + 信封）。
 * 类级 `@Public()` 一条即豁免全局会话墙（S11）与租户墙——实测 `@Impl` 路由上守卫仍生效
 * （Nest 路由生命周期保留）。契约定义单源已前置 `@saas/api-contract`；本类只做 handler 委托。
 */
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Impl(healthContract)
  router() {
    return os.router({
      check: os.handler(() => pingOnly(this.health)),
    });
  }
}

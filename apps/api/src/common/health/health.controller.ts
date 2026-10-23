import { Public } from '@core/saas-kit/tenant-isolation/public.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
// S9 铁律：HealthCheckService 为构造函数注入的类，必须值导入（import type 会擦除 design:paramtypes）
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
// 限流豁免（module-common-rate-limit 甲裁）：探活/CI verify-prod-boot 不得被锁。
import { SkipThrottle } from '@nestjs/throttler';
import { ApiEnvelope, ApiErrorResponse, apiOkPassthrough } from '../contracts/api-contracts';

/**
 * 存活探针（module-common-health-probe · softkit 借鉴正向项 #1）：Dockerfile `HEALTHCHECK`
 * 声明的 `/api/v1/health` 此前「声明有、实现无」——容器恒 unhealthy，部署文档承诺面脱节。
 * 类级 `@Public()` 一条即豁免全局会话墙（S11）与租户墙（高危#4 收口已定「@Public 蕴含
 * 无会话=无租户」）。**ping-only**：terminus 12 已移除 `PingHealthIndicator`（实现期订正），
 * `check([])` 空指示器数组即其等价物——响应仅 `{status:'ok'}` 语义，无版本/uptime/环境
 * 指纹（探针端点必然免认证公网暴露，模板最小指纹）；后续 readiness（丁项缓行）只需
 * 追加 indicators，是配置不是重写。
 */
@Public()
@SkipThrottle()
@ApiExtraModels(ApiEnvelope, ApiErrorResponse)
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe (ping-only, no dependency checks)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Service is alive',
      ssotHint: '@nestjs/terminus HealthCheckResult',
    }),
  )
  check() {
    return this.health.check([]);
  }
}

import { z } from 'zod';

/**
 * 存活探针结果体（↔ `@nestjs/terminus` `HealthCheckResult`·M4-b 响应面建模·裁点④顶层骨架）。
 *
 * @remarks
 * `GET /health` 走 `HealthCheckService.check([])`（ping-only·无健康指示器）→ 常态 `status='ok'` + 空 `details`。
 * `status` 值域源自上游 `HealthCheckStatus`（`'ok' | 'error' | 'degraded' | 'shutting_down'`），**非 @core 域且无对拍闸守护**
 * → 采 `z.string()` 不臆造 enum（同 `tenantInvitationViewSchema.status` 纪律：无机制锁的值域不硬承诺，防上游漂移静默失真）。
 * `info`/`error`/`details` 为各健康指示器动态映射（键随注册的指示器变化）→ `z.record` 松型防脆。
 * 本件为**文档/客户端型契约 + 服务端校验**（@Impl 双侧同挂本件 → handler 侧真跑 parse：ping-only 恒返 `status='ok'` + 空 `details`·必命中）。
 *
 * @public
 */
export const healthCheckResultViewSchema = z.object({
  /** 整体健康态（ping-only 恒 `'ok'`·探针降级时为对应态）。 */
  status: z.string(),
  /** 各指示器 up/degraded 明细（可缺省）。 */
  info: z.record(z.string(), z.unknown()).optional(),
  /** 各指示器 down 明细（可缺省）。 */
  error: z.record(z.string(), z.unknown()).optional(),
  /** 全部指示器明细（恒在）。 */
  details: z.record(z.string(), z.unknown()),
});

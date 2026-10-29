import { HttpException } from '@nestjs/common';
import { COMMON_ERROR_STATUS_MAP, ORPCError, os } from '@orpc/server';

/**
 * REST 错误面承接（换轨 WP-D · 一）：把 **in-handler 抛出的 `HttpException`**（服务/领域内
 * `new NotFoundException(...)` / `new ForbiddenException({errorCode})` 等）转成携带原始响应体的
 * `ORPCError`，交由全局 `customErrorResponseBodyEncoder` 复刻逐字 REST 错误信封。
 *
 * @remarks
 * **为何必须有此中间件**：`@Impl` 的 handler 在 `ImplementInterceptor` 内执行，其中抛出的任意异常被
 * oRPC `StandardHandler` 捕获 → `toORPCError(e)` 把非 ORPCError 一律降级为 `INTERNAL_SERVER_ERROR`
 * （500·丢原始 status/body）——即「in-handler 404 变 500」的退化。守卫（SessionGuard/TenantGuard/
 * AuthorizationGuard）在 handler **之外**（Nest 守卫层）抛出，不经此路径，仍走 `HttpExceptionFilter`，
 * 故只补 handler 内这一段即可（守卫五墙 parity 已在 WP-B 实证）。
 *
 * **状态码不丢**：`ImplementInterceptor` 对 `status>=300` 的**对象体**重抛
 * `HttpException(body, status)`，其中 `status` 由 `errorStatusMap[error.code]` 推出。故本处把原始数字
 * 状态经 `statusToORPCCode` 映成 code（common 表内者取语义码 404→`NOT_FOUND`；表外者取通配码
 * `HTTP_<status>`），配合注入的 `restErrorStatusMap`（common ∪ `HTTP_400–599`）round-trip 后状态**逐字复原**
 * （任意 4xx/5xx 皆可，不静默误升 400/500）。
 */
export const REST_ERROR_DATA_KEY = '__rest';

/** 数字 HTTP 状态 → oRPC common code（`COMMON_ERROR_STATUS_MAP` 反查·表外状态用 `HTTP_<status>` 通配 code）。 */
const STATUS_TO_CODE: Record<number, string> = Object.entries(COMMON_ERROR_STATUS_MAP).reduce(
  (acc, [code, status]) => {
    // 同状态多码时取先出现的稳定 code（common 表内一一对应·无冲突）。
    if (!(status in acc)) {
      acc[status] = code;
    }
    return acc;
  },
  {} as Record<number, string>,
);

/**
 * code → HTTP 状态全局表（经 `ORPCModule.forRoot({ errorStatusMap })` 注入）：
 * `encodeError` 只从本表按 `error.code` 取状态。故除 common 语义码外，为 4xx/5xx 全段
 * 预置 `HTTP_<status>` 通配条目，使**任意** in-handler 异常状态（含 common 表外者）经
 * `statusToORPCCode` round-trip 后逐字复原——守住「全逐字兼容」（不静默把 418 误升 400/500）。
 */
export const restErrorStatusMap: Record<string, number> = { ...COMMON_ERROR_STATUS_MAP };
for (let status = 400; status < 600; status++) {
  if (!(status in STATUS_TO_CODE)) {
    // common 已覆盖的状态保留其语义码（调试友好）；仅表外状态加通配码。
    restErrorStatusMap[`HTTP_${status}`] = status;
  }
}

export function statusToORPCCode(status: number): string {
  // common 语义码优先（404→NOT_FOUND…）；表外状态落 `HTTP_<status>` 通配（restErrorStatusMap 已覆 400–599）。
  return STATUS_TO_CODE[status] ?? `HTTP_${status}`;
}

/**
 * 把 in-handler `HttpException` 归一化为 `ORPCError`：状态经 code 承载，原始响应体（`getResponse()`
 * 的 string 或 object）塞进 `data.__rest` 供编码器逐字复刻。
 */
export function toRestORPCError(exception: HttpException): ORPCError<string, unknown> {
  const status = exception.getStatus();
  return new ORPCError(statusToORPCCode(status), {
    message: exception.message,
    data: { [REST_ERROR_DATA_KEY]: exception.getResponse() },
    cause: exception,
  });
}

/**
 * 可复用 REST 错误承接中间件（经中央 `os` 根 `.use` 挂至所有 `@Impl` procedure）。
 * 仅拦 `HttpException`；oRPC 自身抛的校验 `ORPCError('BAD_REQUEST',{issues})` 与其它 ORPCError 原样透传。
 */
export const restErrorMiddleware = os.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof HttpException) {
      throw toRestORPCError(error);
    }
    throw error;
  }
});

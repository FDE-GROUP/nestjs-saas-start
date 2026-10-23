import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { HttpException, type HttpStatus } from '@nestjs/common';

/**
 * BA 服务端 API 错误 → HTTP 语义映射（门面统一出口·module-rbac-casl §2.3.1）。
 *
 * 已是 Nest `HttpException`（门面自身的前置拒绝，如 auth 实例未就绪/guard 拒）原样直透，
 * 不二次包装（保类型与 errorCode 不降级）。
 * BA `APIError` 携**数值** `.statusCode`（如 400）+ **字符串码** `.status`（如 "BAD_REQUEST"，
 * 非数值不可直接映射）；两者均取首个可解析为有限数者——4xx（400=建租重复 slug、402=seats、
 * 403=membership 等数据事实拒绝）透传状态与消息，并附泛用业务码 `ORG:PROVISIONING_REJECTED`
 * 于 object response（filter 透传入 envelope.errorCode·前端据 code 辨类、据 status 细分；BA 仅回
 * 不透明 message+status，门面不逐态猜具体语义码）；5xx/未知错误原样上抛交全局异常过滤器（500 面不伪装）。
 * 亦兼容仅附数值/数字串 `.status` 的来源（如测试桩）。
 */
export function mapBaError(err: unknown): never {
  if (err instanceof HttpException) throw err;
  const e = err as { statusCode?: unknown; status?: unknown; message?: unknown } | undefined;
  // 真实 BA APIError 数值在 `.statusCode`（`.status` 是字符串码）；按优先级取首个可解析为有限数的字段。
  const raw = [e?.statusCode, e?.status].find(
    (v) =>
      typeof v === 'number' ||
      (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))),
  );
  const status = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    throw new HttpException(
      {
        message: String(e?.message ?? 'Bad Request'),
        errorCode: ERROR_CODES.ORG_PROVISIONING_REJECTED,
      },
      status as HttpStatus,
    );
  }
  throw err;
}

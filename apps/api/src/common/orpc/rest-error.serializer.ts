import type { AnyORPCError } from '@orpc/server';
import { I18nContext } from 'nestjs-i18n';
import type { ResponseErrorDetail } from '../errors/response-error-detail';
import {
  joinIssuePath,
  type ValidationIssueLike,
} from '../errors/standard-schema-validation.exception';
import { REST_ERROR_DATA_KEY } from './rest-error.middleware';

/**
 * REST 错误面承接（换轨 WP-D · 二）：`ORPCModule.forRoot({ customErrorResponseBodyEncoder })` 全局钩子。
 *
 * @remarks
 * 产出的 body 会经 `ImplementInterceptor`（对 `status>=300` 对象体）重抛为 `HttpException(body, status)`，
 * 再由既有 `HttpExceptionFilter` 补全 `statusCode/timestamp/path/requestId`（逐字同 REST·单源不变）。
 * 故本处只负责把 oRPC 错误**归一化成 HttpExceptionFilter 认得的响应体形**（`message`/`error`/`errorCode?`/`errors?`），
 * **不**自造 path/requestId/timestamp——那些是过滤器单源。三分支：
 *
 * 1. **in-handler 业务异常**（`data.__rest`·由 `restErrorMiddleware` 塞入）：原样透传 `HttpException.getResponse()`
 *    （object 直接返回·string 包成 `{message}`），令过滤器复刻 message/error/errorCode/errors——与其在旧 REST 面
 *    处理的同一异常逐字等价。
 * 2. **oRPC standard-schema 校验失败**（`data.issues`·`.input()` 校验产 `ORPCError('BAD_REQUEST',{issues})`）：
 *    渲染为与旧 `StandardSchemaValidationExceptionFilter` **逐字同形**的 400 体（顶层 `message` 译文数组 +
 *    `errors[]{path?,message}` + `error:'Bad Request'`·i18n 命中即译、未命中原样透传）。
 * 3. **兜底**（未预期/裸 Error→INTERNAL_SERVER_ERROR·无 __rest 无 issues）：返回 `{}`，令过滤器产通用 500 信封
 *    （`message:'Internal server error'`·`error:'Internal Server Error'`·不泄露原文·与旧非-HttpException 分支一致）。
 */
export function restErrorResponseBodyEncoder(error: AnyORPCError): Record<string, unknown> {
  const data = error.data as Record<string, unknown> | undefined;

  // 分支 1：in-handler 业务 HttpException（middleware 归一化携带的原始响应体）。
  if (data && REST_ERROR_DATA_KEY in data) {
    const rest = data[REST_ERROR_DATA_KEY];
    if (rest && typeof rest === 'object') {
      return rest as Record<string, unknown>;
    }
    return { message: rest };
  }

  // 分支 2：standard-schema 输入校验失败 → 逐字复刻旧校验过滤器 400 体（含 i18n 译文）。
  const issues = data?.issues;
  if (Array.isArray(issues)) {
    const details: ResponseErrorDetail[] = (issues as readonly ValidationIssueLike[]).map(
      (issue) => {
        const path = joinIssuePath(issue.path);
        return { ...(path ? { path } : {}), message: translate(issue.message) };
      },
    );
    return {
      message: details.map((detail) => detail.message),
      error: 'Bad Request',
      ...(details.length > 0 ? { errors: details } : {}),
    };
  }

  // 分支 3：兜底通用 500（不泄露 exception 原文·与旧 HttpExceptionFilter 非-HttpException 分支同）。
  return {};
}

/** i18n 译文（与 `StandardSchemaValidationExceptionFilter` 同口径：无服务/未命中即原样透传）。 */
function translate(message: string): string {
  const i18nCtx = I18nContext.current();
  const service = i18nCtx?.service;
  if (!service) {
    return message;
  }
  try {
    return String(service.translate(message, { lang: i18nCtx?.lang, defaultValue: message }));
  } catch {
    return message;
  }
}

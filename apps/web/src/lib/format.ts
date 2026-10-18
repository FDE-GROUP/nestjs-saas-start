import { errorCodeOf } from '@saas/api-client';

/** ISO date-time → YYYY-MM-DD（无法解析回落原串，避免渲染 NaN）。 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/**
 * 从后端错误响应体提取结构化字段（F2 · 错误窄化 + 关联 id）。
 * 据 @core 单源 `errorCodeOf` 提码；message 兼容 string / string[]（filter 校验面）；
 * requestId/statusCode/path 采后端 HttpExceptionFilter 同源键，供前端日志对映后端。
 */
export interface ApiErrorDetail {
  message: string;
  errorCode?: string;
  requestId?: string;
  statusCode?: number;
  path?: string;
}

export function apiErrorDetail(body: unknown): ApiErrorDetail {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = b.message as string | string[] | undefined;
  const message = Array.isArray(raw) ? raw.join('; ') : (raw ?? '请求失败');
  const code = errorCodeOf(body);
  return {
    message,
    ...(code ? { errorCode: code } : {}),
    ...(typeof b.requestId === 'string' ? { requestId: b.requestId } : {}),
    ...(typeof b.statusCode === 'number' ? { statusCode: b.statusCode } : {}),
    ...(typeof b.path === 'string' ? { path: b.path } : {}),
  };
}

/**
 * 把后端错误响应体窄化成一句可读文案（渲染用）。
 */
export function describeApiError(body: unknown): string {
  const d = apiErrorDetail(body);
  return d.errorCode ? `${d.message}（${d.errorCode}）` : d.message;
}

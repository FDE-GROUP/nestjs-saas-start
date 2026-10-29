import { errorCodeOf } from '@saas/api-client';

/**
 * 日期出线 → YYYY-MM-DD（无法解析回落原串，避免渲染 NaN）。
 * 【换轨 B-6c】客户端已 `reviving Date`→契约视图日期字段型为 `Date`；此处兼收 `Date` 与（mock/历史）ISO 串。
 */
export function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === 'string' ? value : String(value);
  }
  return d.toISOString().slice(0, 10);
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
  // 【换轨 B-6 过渡】新链抛 `ORPCError`（其 `.data` 挂 REST 错误体·由 api-client decoder 置）；
  // 旧链传 REST 体本身。据 `name==='ORPCError'` 鸭形拆 `.data`，两形都归一到同一字段源。
  const source =
    body && typeof body === 'object' && (body as { name?: string }).name === 'ORPCError'
      ? (body as { data?: unknown }).data
      : body;
  const b = (source ?? {}) as Record<string, unknown>;
  const raw = b.message as string | string[] | undefined;
  const message = Array.isArray(raw) ? raw.join('; ') : (raw ?? '请求失败');
  const code = errorCodeOf(source);
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

/**
 * 前端客户端日志单源（对齐后端 LoggerService「dev 结构化便于查看 / prod 精简不刷屏」口径）。
 *
 * 关键：带出后端 `requestId`（HttpExceptionFilter 与响应头 `x-request-id` 同源），
 * 使前端 console 与后端日志可按同一 id 关联排查。dev 附字段对象（可展开），
 * prod 仅单行 message（不刷屏、留待前端监控采集）。
 */
import { apiErrorDetail } from './format';

const isDev = import.meta.env.DEV;

export interface ApiCallMeta {
  /** 请求路径（相对·同源）。 */
  path: string;
  method?: string;
  /** 业务归属标记（如 workspaces / members / subscription）。 */
  scope?: string;
}

/** API 错误落一条结构化日志：dev 附字段对象（requestId 对映后端），prod 仅一行。 */
export function logApiError(meta: ApiCallMeta, body: unknown): void {
  const d = apiErrorDetail(body);
  const method = meta.method ?? 'GET';
  const path = d.path ?? meta.path;
  const tag = `[api:${meta.scope ?? 'error'}]`;
  const head = `${tag} ${method} ${path}${d.statusCode ? ` → ${d.statusCode}` : ''}${
    d.errorCode ? ` ${d.errorCode}` : ''
  }`;
  if (isDev) {
    console.error(head, {
      requestId: d.requestId,
      statusCode: d.statusCode,
      errorCode: d.errorCode,
      detail: d.message,
    });
  } else {
    console.error(head);
  }
}

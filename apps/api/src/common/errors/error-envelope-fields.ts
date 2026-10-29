import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';

/** `errorEnvelopeFields` 依赖的最小请求形状（FastifyRequest / Nest ctx request 均可传入）。 */
interface EnvelopeRequestLike {
  url?: string;
  id?: string | number;
}

/**
 * 错误信封关联三字段（`timestamp/path/requestId`）单源（承换轨评审 M3）。
 *
 * @remarks
 * REST 面（`HttpExceptionFilter` / `StandardSchemaValidationExceptionFilter`）与裸 Fastify 面
 * （MCP 代理会话网关）经此同文发射，杜绝各面各自复制 `@saas/contracts` `errorResponseSchema`
 * 必填字段而漂移。`requestId` 读 `requestIdHook` 写入的 ALS 源（与 x-request-id 头、日志、
 * correlationId 同 id）；ALS 缺位回落 Fastify 原生 `req.id`，再缺位落 `'req-unknown'` 哨兵。
 */
export function errorEnvelopeFields(request: EnvelopeRequestLike): {
  timestamp: string;
  path: string;
  requestId: string;
} {
  return {
    timestamp: new Date().toISOString(),
    path: request.url ?? '',
    requestId: currentRequestId() ?? String(request.id ?? 'req-unknown'),
  };
}

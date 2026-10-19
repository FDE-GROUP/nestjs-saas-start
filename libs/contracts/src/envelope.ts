import { z } from 'zod';

/**
 * HTTP 响应信封/错误契约单源（S7a·③ 裁定：envelope/error-detail 上移 contracts）。
 *
 * 真相源 = 实存件行为：`TransformInterceptor`（成功面 `{data, meta?, statusCode, message}`）与
 * `HttpExceptionFilter` / `StandardSchemaValidationExceptionFilter`（错误面 `ErrorResponse`·外形逐字不变）。
 * apps/api 侧文档类（`api-contracts.ts`）与过滤器经本单源**派生 + 编译期双向赋值锁 + 实跑 safeParse 对拍**
 * 三道防线锚定（防「文档形/契约形/实跑形」静默漂移·同 F1 锁测精神）。
 *
 * 建模面（非运行时校验管消费）：响应出线不过本 schema 的 validate——S7b 白名单序列化只挂
 * 各端点 `@SerializeOptions({schema})` 的响应 schema，信封面归拦截器职责，此处为**类型与文档单源**。
 */

/**
 * 结构化错误明细（就绪预备 §2.3 #3·丙裁）：校验/业务失败**共用**的扁平明细。
 * - `path`：字段路径（校验失败 = 字段路径串；业务失败可缺省）
 * - `code`：细分机器码（可选·业务子错误给；校验面留空，靠 statusCode+path 已可辨型）
 * - `message`：人面可读（随 i18n 译文）
 */
export const responseErrorDetailSchema = z.object({
  path: z.string().optional(),
  code: z.string().optional(),
  message: z.string(),
});
export type ResponseErrorDetail = z.infer<typeof responseErrorDetailSchema>;

/**
 * 错误响应体（ErrorResponse 契约·换轨前后**逐字同形**）：顶层 `message` 兼容 string（常规）
 * 与 string[]（校验逐字段）双态；`errorCode` 仅当异常以 object response 形态携带时透传（非破坏追加）。
 */
export const errorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string(),
  timestamp: z.string(),
  path: z.string(),
  /** 请求关联 id：与 x-request-id 头、日志、领域事件 correlationId 同源。 */
  requestId: z.string(),
  /** 业务错误码（`NAMESPACE:NAME` 冒号文法·单源 = @core ERROR_CODES）。 */
  errorCode: z.string().optional(),
  errors: z.array(responseErrorDetailSchema).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/**
 * 成功信封（↔ `TransformInterceptor`）：normal 分支 `{data, statusCode, message}`；
 * `meta` 仅 `{items, meta}` 提升分支出现（现网分页契约 `Page/CursorPage` 无 meta 键·不触发）。
 */
export const apiEnvelopeSchema = z.object({
  data: z.unknown(),
  meta: z.record(z.string(), z.unknown()).optional(),
  statusCode: z.number(),
  message: z.string(),
});
export type ApiEnvelope = z.infer<typeof apiEnvelopeSchema>;

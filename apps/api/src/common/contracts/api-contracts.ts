import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type {
  ApiEnvelope as ApiEnvelopeContract,
  ErrorResponse as ErrorResponseContract,
  ResponseErrorDetail,
} from '@saas/contracts/index';

/**
 * HTTP 响应契约公共面（前端 F1 · module-frontend-api-client §2.1）。
 *
 * **纯文档面零运行时**：类只作 `@nestjs/swagger` schema 源（经组合子显式 `$ref` 消费，
 * 不依赖装饰器元数据反射），不进任何运行时链路。形状单源 = 实存件源码：
 * - `ApiEnvelope` ↔ `TransformInterceptor` normal 分支（`{data, statusCode, message}`）
 * - `ApiErrorResponse` ↔ `HttpExceptionFilter.ErrorResponse`
 * 对拍锁测见同目录 `api-contracts.test.ts`，防「文档形与实跑形静默漂移」。
 *
 * 分页注记：`Page<T>`/`CursorPage<T>` 契约**无 `meta` 键**，不触发拦截器的 `{items,meta}` 提升分支，
 * 故整个分页对象作 `data` 原样裹入（`data = {items, total, limit, offset}` 或 `{items, hasMore, nextCursor?}`）。
 */
export class ApiEnvelopeBase {
  @ApiProperty({ description: 'HTTP 状态码回显（响应体字段，非状态码本身）。' })
  statusCode!: number;

  @ApiProperty({ description: '人面可读消息（成功面恒 "Success"）。' })
  message!: string;
}

export class ApiEnvelope extends ApiEnvelopeBase {
  @ApiProperty({
    description: '业务载荷；具体形状见 allOf 第二项的 $ref。',
    additionalProperties: true,
  })
  data!: unknown;
}

export class ApiErrorDetail {
  @ApiProperty({
    required: false,
    description: '字段路径（校验失败 = property；业务失败可缺省）。',
  })
  path?: string;

  @ApiProperty({ required: false, description: '细分机器码（业务子错误给；校验面留空）。' })
  code?: string;

  @ApiProperty({ description: '人面可读（随 i18n 译文）。' })
  message!: string;
}

export class ApiErrorResponse {
  @ApiProperty({ description: 'HTTP 状态码。' })
  statusCode!: number;

  @ApiProperty({
    description: '人面可读消息；校验失败时为逐字段消息数组。',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({ description: 'HTTP 类别名（如 "Not Found"）。' })
  error!: string;

  @ApiProperty({ format: 'date-time', description: '服务端时刻 ISO 串。' })
  timestamp!: string;

  @ApiProperty({ description: '请求路径。' })
  path!: string;

  @ApiProperty({
    description: '请求关联 id（与 x-request-id 头、日志、领域事件 correlationId 同源）。',
  })
  requestId!: string;

  @ApiProperty({
    required: false,
    description:
      '业务错误码（`NAMESPACE:NAME` 冒号文法·单源 = @core ERROR_CODES，前端据 code 分支、据 message 展示）。',
  })
  errorCode?: string;

  @ApiProperty({
    required: false,
    isArray: true,
    type: () => ApiErrorDetail,
    description: '字段级结构化明细。',
  })
  errors?: ApiErrorDetail[];
}

/** envelope 裹载荷的通用 `@ApiResponse` 参数组合子（status 缺省 200）。 */
export function apiEnvelopeShape(
  dataType: new (...args: never[]) => unknown,
  opts: { status?: number; description: string },
) {
  return {
    status: opts.status ?? 200,
    description: opts.description,
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiEnvelope) },
        {
          type: 'object',
          properties: { data: { $ref: getSchemaPath(dataType as never) } },
        },
      ],
    },
  };
}

/** 成功 2xx（envelope 裹载荷）的 `@ApiResponse` 参数组合子。 */
export function apiOk(dataType: new (...args: never[]) => unknown, description: string) {
  return apiEnvelopeShape(dataType, { status: 200, description });
}

/** 业务错误响应（filter 形）的 `@ApiResponse` 参数组合子。 */
export function apiError(status: number, description: string) {
  return { status, description, type: ApiErrorResponse };
}

/** 成功 2xx · data 为某类型**数组**（非分页契约·直接 `T[]` 返回）的组合子。 */
export function apiOkArray(itemsType: new (...args: never[]) => unknown, description: string) {
  return {
    status: 200,
    description,
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiEnvelope) },
        {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: getSchemaPath(itemsType as never) } },
          },
        },
      ],
    },
  };
}

/**
 * 透传型成功响应（data 为外部数据面 · 非本仓 Nest DTO 反射可达）的组合子。
 * 适用：BA `auth.api.*` 服务端直调透传（tenants self/admin 12 面）与 bulk-export 六/四面聚合
 * （user/tenant data export）——以 `description` 点名真相源 SSOT，`data` 声明为自由对象，
 * openapi-typescript 得 `Record<string, unknown>` 而非假精确（诚实·不 overclaim）。
 */
export function apiOkPassthrough(opts: { status?: number; description: string; ssotHint: string }) {
  return {
    status: opts.status ?? 200,
    description: `${opts.description}（透传面·形参真相源 = ${opts.ssotHint}）`,
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiEnvelope) },
        {
          type: 'object',
          properties: { data: { type: 'object', additionalProperties: true } },
        },
      ],
    },
  };
}

// —— 编译期双向对拍（S7a·③ envelope/error-detail 上移 contracts）：文档面类形状 ≡ contracts
// zod 派生形互可赋值，任一侧漂移则 tsc 红（实跑形另由 api-contracts.test.ts 的 safeParse 锁兜底）。——
const _detailFwd: ResponseErrorDetail = {} as ApiErrorDetail;
const _detailBwd: ApiErrorDetail = {} as ResponseErrorDetail;
const _errFwd: ErrorResponseContract = {} as ApiErrorResponse;
const _errBwd: ApiErrorResponse = {} as ErrorResponseContract;
const _envFwd: ApiEnvelopeContract = {} as ApiEnvelope;
const _envBwd: ApiEnvelope = {} as ApiEnvelopeContract;
void _detailFwd;
void _detailBwd;
void _errFwd;
void _errBwd;
void _envFwd;
void _envBwd;

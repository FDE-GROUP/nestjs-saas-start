import type { ClientLink } from '@orpc/client';
import { createORPCClient, ORPCError } from '@orpc/client';
import type { RouterContract, RouterContractClient } from '@orpc/contract';
import { oc } from '@orpc/contract';
import { getOpenAPIMeta, openapi } from '@orpc/openapi';
import { OpenAPILink } from '@orpc/openapi/fetch';
import type { AppRouterContract } from '@saas/api-contract/index';
import { PUBLIC_APP_ROUTER_SPEC } from '@saas/api-contract/index';
import type { ApiErrorBody } from './envelope';

/**
 * typed oRPC 客户端（换轨 WP-E/B-5b）。
 *
 * 型锚 = `@saas/api-contract` 的 `AppRouterContract`（56 公共叶·feature 叶按隔离留 apps/api 不入库），
 * 传输复用官方 `OpenAPILink`：请求编码走与后端 `@orpc/nest` **同一 compact 输入拆分**（path/query/body），
 * 保证零静默丢参；契约改一次前后端同步，无需 openapi codegen。
 *
 * 与 REST 的兼容面（承 §2-2 · WP-D）：
 * - 成功线：后端 `TransformInterceptor` 恒包 `{data, statusCode, message}` 信封，本层出网前拆回 `data`；
 * - 错误线：后端 `HttpExceptionFilter` 产物（REST 错误体·无 oRPC `code` 字段）经
 *   `customErrorResponseBodyDecoder` 映射成 `ORPCError`，原始 body 全量挂 `.data`（供 `errorCodeOf`/`statusCode` 分支）。
 */

/** 缺省基址（无 origin·浏览器同源相对解析；paths 已由契约 `meta.path` 带绝对段，此处只补全局前缀）。 */
export const DEFAULT_API_BASE_URL = '/api/v1';

export interface RpcClientOptions {
  /** 基址（不含 origin·须以 `/` 起·`StandardUrl` 约束）；缺省 `/api/v1`。 */
  baseUrl?: `/${string}`;
  /** 绝对 origin（CORS / Node 测试用·浏览器同源下留空）。 */
  origin?: string;
}

/** REST 成功信封 `{data, statusCode, message}` → 取 `data`；非信封形状原样返回（防御·不误伤裸载荷）。 */
export function unwrapRestEnvelope(result: unknown): unknown {
  if (
    result !== null &&
    typeof result === 'object' &&
    'data' in result &&
    'statusCode' in result &&
    'message' in result
  ) {
    return (result as { data: unknown }).data;
  }
  return result;
}

/**
 * 【换轨 B-6c · Date-on-wire】客户端 `reviving Date`：后端 REST 面（`TransformInterceptor` + Nest 序列化）
 * 把 `Date` 出为**规范 UTC ISO 串**（`...T..:..:..mmmZ`），而契约 `.output()` 的日期字段是 `z.instanceof(Date)`
 * → router 派生客户端型为 `Date`。为消「型=Date / 运行时=string」静默错型，出网入 payload 后据规范 ISO 串
 * **可逆**地还原为 `Date`：仅当 `new Date(s).toISOString() === s`（严格规范 UTC 带毫秒形）方转，
 * 普通 id/邮箱/枚举/游标等非规范串永不误伤（编译期审计：响应契约中日期字段皆 `z.instanceof(Date)`、无 string 化 datetime）。
 */
const CANONICAL_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function reviveIsoDateStrings<T>(value: T): T {
  return reviveValue(value) as T;
}

function reviveValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (CANONICAL_ISO_UTC.test(value)) {
      const date = new Date(value);
      // 可逆闸：回环相等才转 Date，否则原样保留（防误伤 + 与 openapi string 形对拍可回退）。
      if (date.toISOString() === value) {
        return date;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(reviveValue);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = reviveValue(entry);
    }
    return out;
  }
  return value;
}

/** REST HTTP status → oRPC 标准码（未知码回退按 4xx/5xx 归类）。 */
const STATUS_TO_ORPC_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_CONTENT',
  429: 'TOO_MANY_REQUESTS',
};

/** REST 错误体 → `ORPCError`（体非对象 → 交回默认解码）。message 数组折叠；原始 body 全量入 `.data`。 */
export function decodeRestErrorBody(
  deserializedBody: unknown,
  status: number,
): ORPCError<string, ApiErrorBody> | undefined {
  if (deserializedBody === null || typeof deserializedBody !== 'object') {
    return undefined;
  }
  const body = deserializedBody as Partial<ApiErrorBody>;
  const resolvedStatus = typeof body.statusCode === 'number' ? body.statusCode : status;
  const code =
    STATUS_TO_ORPC_CODE[resolvedStatus] ??
    (resolvedStatus >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const message = Array.isArray(body.message)
    ? body.message.join('; ')
    : (body.message ?? `HTTP ${resolvedStatus}`);
  const data = { ...body, statusCode: resolvedStatus } as ApiErrorBody;
  return new ORPCError(code, { message, data });
}

/**
 * 契约 `meta.path` 用 Nest 风格 `:name`（服务端 `@Impl` 需此形·与旧 REST 逐字节一致），
 * 而通用 `OpenAPILink` 只认 OpenAPI 风格 `{name}` 模板。故为客户端派生一层「router 视图」：
 * 键位/方法/输入输出型均不变，仅把路径段 `:name` → `{name}`，让 link 正确插值路径参。
 */
function toOpenApiPathTemplate(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** 由公共契约树派生客户端视图 router（仅供 `OpenAPILink` 解 meta·不导给前端调用型）。 */
function buildClientRouterView(): RouterContract {
  const walk = (node: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (value !== null && typeof value === 'object' && '~orpc' in value) {
        const contract = value as unknown as { meta: (m: unknown) => unknown };
        const meta = getOpenAPIMeta(value as never) as { path: string };
        out[key] = contract.meta(
          openapi({ ...meta, path: toOpenApiPathTemplate(meta.path) } as never),
        );
      } else {
        out[key] = walk(value as Record<string, unknown>);
      }
    }
    return out;
  };
  return oc.router(walk(PUBLIC_APP_ROUTER_SPEC as unknown as Record<string, unknown>) as never);
}

/**
 * 包装 `OpenAPILink`：仅在其 `call` 成功后拆信封，错误（已由 decoder 抛 `ORPCError`）原样透传。
 * 用 `object` 作客户端上下文（本壳无 per-call context 需求）。
 */
export function createRpcClientLink(options: RpcClientOptions = {}): ClientLink<object> {
  const openApiLink = new OpenAPILink(buildClientRouterView(), {
    url: options.baseUrl ?? DEFAULT_API_BASE_URL,
    ...(options.origin ? { origin: options.origin } : {}),
    customErrorResponseBodyDecoder: (body, response) => decodeRestErrorBody(body, response.status),
  }) as unknown as ClientLink<object>;

  return {
    call: async (path, input, callOptions) =>
      reviveIsoDateStrings(unwrapRestEnvelope(await openApiLink.call(path, input, callOptions))),
  };
}

/**
 * 全型客户端：`createORPCClient` 按调用键路径（procedure-key）代理到 link，link（持 `appContractRouter`）
 * 从命中 procedure 的 `meta.path` 取真实 URL——键位与 URL 解耦（契约树键仅前端人体工学）。
 * leaf 输入 = 契约 flat 对象·输出 = 拆封后的 payload·错误 = `ORPCError`。
 */
export function createRpcClient(
  options: RpcClientOptions = {},
): RouterContractClient<AppRouterContract, object> {
  return createORPCClient<RouterContractClient<AppRouterContract, object>>(
    createRpcClientLink(options),
  );
}

export type ApiRpcClient = ReturnType<typeof createRpcClient>;

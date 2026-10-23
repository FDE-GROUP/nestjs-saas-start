import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES as CORE_ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { createApiClient, DEFAULT_BASE_PATH } from './client';
import { API_ENVELOPE_KEYS, API_ERROR_BODY_KEYS } from './envelope';
import { ApiError, ERROR_CODES, errorCodeOf, hasErrorCode, isErrorCode } from './errors';

/** 手写 envelope 契约 ↔ openapi.yaml（SSOT）逐字段对拍（漂移即红·配合编译期 `_Exact` 锁闭三向链）。 */
function yamlSchemaProps(name: string): string[] {
  const p = fileURLToPath(new URL('../../../openapi/openapi.yaml', import.meta.url));
  const doc = yaml.load(readFileSync(p, 'utf8')) as {
    components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
  };
  return Object.keys(doc.components?.schemas?.[name]?.properties ?? {}).sort();
}

describe('@saas/api-client · envelope 对拍 openapi.yaml', () => {
  it('ApiEnvelope schema properties ≡ API_ENVELOPE_KEYS', () => {
    expect(yamlSchemaProps('ApiEnvelope')).toEqual([...API_ENVELOPE_KEYS].sort());
  });
  it('ApiErrorResponse schema properties ≡ API_ERROR_BODY_KEYS', () => {
    expect(yamlSchemaProps('ApiErrorResponse')).toEqual([...API_ERROR_BODY_KEYS].sort());
  });
});

describe('@saas/api-client · errors 单源（不复制）', () => {
  it('re-export 的 ERROR_CODES 与 @core 为同一对象引用', () => {
    expect(ERROR_CODES).toBe(CORE_ERROR_CODES);
  });
  it('isErrorCode 判别 NAMESPACE:NAME 冒号文法', () => {
    expect(isErrorCode('ROLE:NOT_FOUND')).toBe(true);
    expect(isErrorCode('not-a-code')).toBe(false);
  });
  it('errorCodeOf / hasErrorCode 从响应体窄化', () => {
    const body = {
      statusCode: 404,
      message: 'nope',
      error: 'Not Found',
      timestamp: 't',
      path: '/y',
      requestId: 'r',
      errorCode: CORE_ERROR_CODES.ORG_NOT_FOUND,
    };
    expect(errorCodeOf(body)).toBe(CORE_ERROR_CODES.ORG_NOT_FOUND);
    expect(hasErrorCode(body, CORE_ERROR_CODES.ORG_NOT_FOUND)).toBe(true);
    expect(errorCodeOf({})).toBeUndefined();
  });
  it('ApiError 组装 message（数组折叠）+ errorCode getter', () => {
    const err = new ApiError({
      statusCode: 400,
      message: ['a', 'b'],
      error: 'Bad Request',
      timestamp: 't',
      path: '/p',
      requestId: 'r',
      errorCode: 'AUTH:X',
    });
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('a; b');
    expect(err.errorCode).toBe('AUTH:X');
  });
});

describe('@saas/api-client · typed client 工厂（mock fetch）', () => {
  it('缺省 baseUrl 为空串（paths 已带 /api/v1 前缀·防双前缀）', () => {
    expect(DEFAULT_BASE_PATH).toBe('');
  });
  it('GET 命中 /api/v1/workspaces 且 credentials=same-origin·typed data 可读', async () => {
    let captured: Request | undefined;
    const fetchMock = (input: Request) => {
      captured = input;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: { items: [], total: 0, limit: 10, offset: 0 },
            statusCode: 200,
            message: 'Success',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    const client = createApiClient({ baseUrl: 'http://test.local', fetch: fetchMock });
    const { data, error, response } = await client.GET('/api/v1/workspaces');
    expect(captured?.url).toBe('http://test.local/api/v1/workspaces');
    expect(captured?.credentials).toBe('same-origin');
    expect(response.status).toBe(200);
    expect(error).toBeUndefined();
    // typed 兑现：data.data（envelope.data）暴露为分页形，total 可读。
    expect(data?.data.total).toBe(0);
  });
});

import { ERROR_CODES as CORE_ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_CODES, errorCodeOf, hasErrorCode, isErrorCode } from './errors';

/**
 * errors 单源回归（换轨 B-6c/B-7·openapi codegen 退役后仍锁「不复制」纪律）。
 *
 * 曾在此的「手写 envelope ↔ openapi.yaml 逐字段对拍」与「openapi-fetch typed client 工厂」两组
 * 随 `schema.d.ts`/`client.ts`/`openapi.yaml` SSOT 退役而移除；envelope 契约改由 `@saas/contracts`
 * zod 单源 + 编译期 `_Exact` 锁承载，typed 客户端面由 `rpc-client.test.ts` 覆盖。
 */
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

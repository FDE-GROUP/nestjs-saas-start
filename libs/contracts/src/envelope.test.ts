import { describe, expect, it } from 'vitest';
import { apiEnvelopeSchema, errorResponseSchema, responseErrorDetailSchema } from './envelope';

/**
 * 信封/错误契约单源最小语义锁（S7a）：钉住三张 schema 的可选键与双态语义——
 * 与 apps/api 实跑面的三角互锁（api-contracts.test.ts）互补，本测锁**契约自身语义**。
 */
describe('envelope 契约单源语义（S7a）', () => {
  it('responseErrorDetail：message 必填，path/code 可缺省', () => {
    expect(responseErrorDetailSchema.safeParse({ message: '必填' }).success).toBe(true);
    expect(
      responseErrorDetailSchema.safeParse({ path: 'a', code: 'X:Y', message: 'm' }).success,
    ).toBe(true);
    expect(responseErrorDetailSchema.safeParse({ path: 'a' }).success).toBe(false);
  });

  it('errorResponse：message 双态（string | string[]）+ errorCode/errors 可选加法', () => {
    const base = {
      statusCode: 400,
      error: 'Bad Request',
      timestamp: new Date().toISOString(),
      path: '/api/v1/x',
      requestId: 'req-1',
    };
    expect(errorResponseSchema.safeParse({ ...base, message: '单串' }).success).toBe(true);
    expect(errorResponseSchema.safeParse({ ...base, message: ['a', 'b'] }).success).toBe(true);
    expect(
      errorResponseSchema.safeParse({
        ...base,
        message: ['a'],
        errorCode: 'SUBSCRIPTION:SEAT_LIMIT',
        errors: [{ path: 'email', message: 'm' }],
      }).success,
    ).toBe(true);
    // 不预填 errorCode：缺省合法（保形口径·换轨前后逐字一致的判据之一）。
    expect(errorResponseSchema.safeParse({ ...base, message: 'x' }).success).toBe(true);
  });

  it('apiEnvelope：normal 分支无 meta 合法；{items,meta} 提升分支带 meta 合法', () => {
    expect(
      apiEnvelopeSchema.safeParse({ data: { id: '1' }, statusCode: 200, message: 'Success' })
        .success,
    ).toBe(true);
    expect(
      apiEnvelopeSchema.safeParse({
        data: [],
        meta: { total: 0 },
        statusCode: 200,
        message: 'Success',
      }).success,
    ).toBe(true);
    expect(apiEnvelopeSchema.safeParse({ data: 1, message: 'Success' }).success).toBe(false);
  });
});

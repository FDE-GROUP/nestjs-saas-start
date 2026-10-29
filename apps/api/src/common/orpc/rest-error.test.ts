import 'reflect-metadata';
import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { call, ORPCError } from '@orpc/server';
import { createPostSchema } from '@saas/contracts/index';
import { describe, expect, it } from 'vitest';
import { os } from './orpc';
import { statusToORPCCode, toRestORPCError } from './rest-error.middleware';
import { restErrorResponseBodyEncoder } from './rest-error.serializer';

/**
 * 换轨 WP-D 错误面承接单测（零 DB·进默认 CI）：锁 in-handler `HttpException` 归一化与全局
 * `customErrorResponseBodyEncoder` 的**逐字 REST 形**产出。端到端「重抛 HttpException →
 * HttpExceptionFilter 补 path/requestId/timestamp/statusCode」的线上等价另有 `rest-error.e2e.test.ts`。
 */
describe('WP-D statusToORPCCode（状态→code·round-trip 复原）', () => {
  it('本仓 in-handler 抛出的状态全部反查回对应 common code', () => {
    expect(statusToORPCCode(400)).toBe('BAD_REQUEST');
    expect(statusToORPCCode(401)).toBe('UNAUTHORIZED');
    expect(statusToORPCCode(402)).toBe('PAYMENT_REQUIRED');
    expect(statusToORPCCode(403)).toBe('FORBIDDEN');
    expect(statusToORPCCode(404)).toBe('NOT_FOUND');
    expect(statusToORPCCode(409)).toBe('CONFLICT');
    expect(statusToORPCCode(500)).toBe('INTERNAL_SERVER_ERROR');
    expect(statusToORPCCode(503)).toBe('SERVICE_UNAVAILABLE');
  });

  it('表外状态落 `HTTP_<status>` 通配码（restErrorStatusMap 已覆 400–599·逐字复原状态）', () => {
    expect(statusToORPCCode(451)).toBe('HTTP_451');
    expect(statusToORPCCode(418)).toBe('HTTP_418');
    expect(statusToORPCCode(599)).toBe('HTTP_599');
  });
});

describe('WP-D toRestORPCError（in-handler HttpException 归一）', () => {
  it('NotFoundException → NOT_FOUND code·__rest 恒等于原始 getResponse()', () => {
    const exception = new NotFoundException('Post not found');
    const error = toRestORPCError(exception);
    expect(error).toBeInstanceOf(ORPCError);
    expect(error.code).toBe('NOT_FOUND');
    expect((error.data as { __rest: unknown }).__rest).toBe(exception.getResponse());
  });

  it('携带 errorCode 的业务异常 → FORBIDDEN·__rest 保留 errorCode 供过滤器复刻', () => {
    const exception = new ForbiddenException({ message: 'nope', errorCode: 'SEAT_LIMIT' });
    const error = toRestORPCError(exception);
    expect(error.code).toBe('FORBIDDEN');
    expect((error.data as { __rest: Record<string, unknown> }).__rest).toMatchObject({
      message: 'nope',
      errorCode: 'SEAT_LIMIT',
    });
  });

  it('裸 HttpException(msg, 402) → PAYMENT_REQUIRED（覆盖配额/座位墙字符串体）', () => {
    const exception = new HttpException('quota exceeded', HttpStatus.PAYMENT_REQUIRED);
    const error = toRestORPCError(exception);
    expect(error.code).toBe('PAYMENT_REQUIRED');
    expect(error.data).toEqual({ __rest: exception.getResponse() });
  });
});

describe('WP-D restErrorMiddleware（经 call 验中间件真实拦换）', () => {
  it('handler 抛 NotFoundException → 中间件换成 ORPCError(NOT_FOUND)', async () => {
    const procedure = os.handler(() => {
      throw new NotFoundException('missing');
    });
    const caught = await call(procedure).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ORPCError);
    expect((caught as ORPCError<string, unknown>).code).toBe('NOT_FOUND');
    expect((caught as { data: { __rest: unknown } }).data.__rest).toBeDefined();
  });

  it('oRPC 自身校验 ORPCError（非 HttpException）原样透传·交编码器产 400', async () => {
    const procedure = os.input(createPostSchema).handler(() => ({ ok: true }));
    // 故意传缺必填 title 的非法体（验 standard-schema 校验失败产 BAD_REQUEST）·故绕 TS 型别用 never。
    const caught = await call(procedure, {} as never).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ORPCError);
    expect((caught as ORPCError<string, unknown>).code).toBe('BAD_REQUEST');
    expect(Array.isArray((caught as { data: { issues: unknown } }).data.issues)).toBe(true);
  });

  it('非 HttpException 的裸 Error 不被中间件改写·原样透传（500 兜底属 HTTP 层 StandardHandler→编码器分支3 职责）', async () => {
    const procedure = os.handler(() => {
      throw new Error('driver leaked SQL fragment');
    });
    const caught = await call(procedure).catch((error: unknown) => error);
    // 中间件只拦 HttpException；裸 Error 原样上抛（不在 procedure 层包装）。
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ORPCError);
    // 该裸 Error 到达 HTTP 层经 toORPCError 降为 INTERNAL_SERVER_ERROR（无 __rest/无 issues）·
    // 编码器分支3 产 {} → 过滤器给通用 500 信封·不泄露原文（见 e2e）。
    expect(restErrorResponseBodyEncoder({ data: undefined } as never)).toEqual({});
  });
});

describe('WP-D restErrorResponseBodyEncoder（产出 HttpExceptionFilter 认得的响应体形）', () => {
  const asError = (data: unknown) => ({ data }) as never;

  it('分支1·业务 object __rest 原样透传（含 errorCode/errors）', () => {
    const rest = { message: 'boom', error: 'Conflict', errorCode: 'E1', statusCode: 409 };
    expect(restErrorResponseBodyEncoder(asError({ __rest: rest }))).toEqual(rest);
  });

  it('分支1·业务 string __rest 包成 {message}（error/status 交过滤器缺省）', () => {
    expect(restErrorResponseBodyEncoder(asError({ __rest: 'quota exceeded' }))).toEqual({
      message: 'quota exceeded',
    });
  });

  it('分支2·standard-schema issues → 逐字 400 校验体（message 数组 + errors[]{path,message} + Bad Request）', () => {
    const body = restErrorResponseBodyEncoder(
      asError({ issues: [{ message: 'title is required', path: ['title'] }, { message: 'bad' }] }),
    );
    expect(body).toEqual({
      message: ['title is required', 'bad'],
      error: 'Bad Request',
      errors: [{ path: 'title', message: 'title is required' }, { message: 'bad' }],
    });
  });

  it('分支3·无 __rest 无 issues（兜底 500）→ {} 令过滤器产通用信封·不泄露原文', () => {
    expect(restErrorResponseBodyEncoder(asError(undefined))).toEqual({});
    expect(restErrorResponseBodyEncoder(asError({ someOther: 1 }))).toEqual({});
  });
});

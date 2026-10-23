import { requestStorage } from '@core/saas-kit/shared-kernel/context/request-context';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import {
  type ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ResponseErrorDetail } from '../errors/response-error-detail';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * HttpExceptionFilter 单测（错误响应契约增强片·补该 filter 此前的零单测欠账）：
 * 锁定 requestId 兜底链（ALS → request.id → 'req-unknown'）与 errorCode 透传形态。
 */

interface SentBody {
  [key: string]: unknown;
}

function createHost(request: Record<string, unknown>) {
  const sent: { body?: SentBody; status?: number } = {};
  const reply = {
    status: (code: number) => {
      sent.status = code;
      return reply;
    },
    send: (body: SentBody) => {
      sent.body = body;
      return reply;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

function createFilter() {
  const logger = { error: vi.fn(), warn: vi.fn() };
  return { filter: new HttpExceptionFilter(logger as never), logger };
}

describe('HttpExceptionFilter · requestId 契约', () => {
  it('ALS 上下文存在时，响应体 requestId 取 currentRequestId()', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/x', method: 'GET', id: 99 });

    requestStorage.run({ requestId: 'als-1' }, () => {
      filter.catch(new ForbiddenException('nope'), host);
    });

    expect(sent.body?.requestId).toBe('als-1');
    expect(sent.status).toBe(403);
  });

  it('无 ALS 上下文时回落 Fastify 原生 request.id', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/x', method: 'GET', id: 42 });

    filter.catch(new ForbiddenException('nope'), host);

    expect(sent.body?.requestId).toBe('42');
  });

  it('ALS 与 request.id 俱缺时落 req-unknown，且 500 形状不缺 requestId', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/x', method: 'GET' });

    filter.catch(new InternalServerErrorException('boom'), host);

    expect(sent.body?.requestId).toBe('req-unknown');
    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('裸 Error（非 HttpException）兜底 500 时携带 requestId·message 归一不外泄原文', () => {
    const { filter, logger } = createFilter();
    const { host, sent } = createHost({ url: '/y', method: 'POST', id: 7 });

    requestStorage.run({ requestId: 'als-err' }, () => {
      filter.catch(new Error('SELECT * FROM secret_table WHERE token=...'), host);
    });

    expect(sent.body?.requestId).toBe('als-err');
    // 甲档收口（#4）：响应体 message 归一，不外泄内部原文
    expect(sent.body?.message).toBe('Internal server error');
    expect(sent.status).toBe(500);
    // 原文随堆栈入 5xx 日志（第二参），不外泄至响应
    expect(logger.error).toHaveBeenCalledTimes(1);
    const loggedDetail = String(logger.error.mock.calls[0]?.[1]);
    expect(loggedDetail).toContain('SELECT * FROM secret_table');
  });

  it('HttpException authored 5xx message 照常透传（甲档不误伤安全文本）', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/y', method: 'POST', id: 8 });

    filter.catch(new InternalServerErrorException('上游服务暂时不可用'), host);

    expect(sent.body?.message).toBe('上游服务暂时不可用');
    expect(sent.status).toBe(500);
  });
});

describe('HttpExceptionFilter · errorCode 透传', () => {
  it('object response 携带字符串 errorCode 时透传', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/z', method: 'GET', id: 1 });

    filter.catch(
      new ForbiddenException({ message: '租户上下文缺失', errorCode: 'NO_ACTIVE_TENANT' }),
      host,
    );

    expect(sent.body?.errorCode).toBe('NO_ACTIVE_TENANT');
    expect(sent.body?.message).toBe('租户上下文缺失');
  });

  it('未携带 errorCode 时响应体不含该键（可选字段非破坏）', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/z', method: 'GET', id: 1 });

    filter.catch(new ForbiddenException('plain string'), host);

    expect('errorCode' in (sent.body as object)).toBe(false);
  });

  it('errorCode 非字符串（脏数据）时不透传', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/z', method: 'GET', id: 1 });

    filter.catch(new HttpException({ message: 'm', errorCode: 123 }, HttpStatus.BAD_REQUEST), host);

    expect('errorCode' in (sent.body as object)).toBe(false);
  });

  it('子类 string + options 形（Nest 12 createBody 嵌入 response 对象）透传', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/auth', method: 'GET', id: 2 });

    filter.catch(
      new UnauthorizedException('session expired', { errorCode: ERROR_CODES.AUTH_SESSION_INVALID }),
      host,
    );

    expect(sent.body?.errorCode).toBe('AUTH:SESSION_INVALID');
    expect(sent.body?.message).toBe('session expired');
    expect(sent.body?.error).toBe('Unauthorized');
  });

  it('base HttpException(msg, 402, { errorCode }) 走实例属性兜底', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/seat', method: 'POST', id: 3 });

    filter.catch(
      new HttpException('Seat quota exceeded', HttpStatus.PAYMENT_REQUIRED, {
        errorCode: ERROR_CODES.BILLING_SEAT_LIMIT_EXCEEDED,
      }),
      host,
    );

    expect(sent.body?.errorCode).toBe('BILLING:SEAT_LIMIT_EXCEEDED');
    expect(sent.body?.message).toBe('Seat quota exceeded');
    expect(sent.status).toBe(402);
  });

  it('object response 携带 errors[] 结构化明细时透传', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/complex', method: 'POST', id: 4 });

    const details: ResponseErrorDetail[] = [
      { path: 'email', message: 'invalid email' },
      { path: 'name', message: 'too short' },
    ];
    filter.catch(new ForbiddenException({ message: 'validation failed', errors: details }), host);

    expect(sent.body?.errors).toEqual(details);
  });

  it('未携带 errors[] 时响应体不含该键（可选字段非破坏）', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/simple', method: 'GET', id: 5 });

    filter.catch(new ForbiddenException('plain'), host);

    expect('errors' in (sent.body as object)).toBe(false);
  });
});

describe('HttpExceptionFilter · error 按状态短名归一（global-error-envelope-reason-phrase）', () => {
  it('裸 object 无 error 的 403（mapBaError 形）→ error 归 Forbidden（不再误标 Internal Server Error）', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/invitations/mine', method: 'GET', id: 11 });

    filter.catch(
      new HttpException(
        {
          message: 'Email verification required',
          errorCode: ERROR_CODES.ORG_PROVISIONING_REJECTED,
        },
        HttpStatus.FORBIDDEN,
      ),
      host,
    );

    expect(sent.status).toBe(403);
    expect(sent.body?.error).toBe('Forbidden');
    expect(sent.body?.errorCode).toBe('ORG:PROVISIONING_REJECTED');
  });

  it('裸 string 的 402（quota 座位超限形）→ error 归 Payment Required 且 errorCode 仍透出', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/seat', method: 'POST', id: 12 });

    filter.catch(
      new HttpException('Seat quota exceeded', HttpStatus.PAYMENT_REQUIRED, {
        errorCode: ERROR_CODES.BILLING_SEAT_LIMIT_EXCEEDED,
      }),
      host,
    );

    expect(sent.body?.error).toBe('Payment Required');
    expect(sent.body?.errorCode).toBe('BILLING:SEAT_LIMIT_EXCEEDED');
  });

  it('裸 object 无 error 的 400 → error 归 Bad Request', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/dup', method: 'POST', id: 13 });

    filter.catch(new HttpException({ message: 'slug 重复' }, HttpStatus.BAD_REQUEST), host);

    expect(sent.body?.error).toBe('Bad Request');
  });

  it('回归锁：子类自带 error 优先（UnauthorizedException→Unauthorized）', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/auth', method: 'GET', id: 14 });

    filter.catch(new UnauthorizedException('session expired'), host);

    expect(sent.body?.error).toBe('Unauthorized');
  });

  it('回归锁：裸 Error（非 HttpException）兜底 500 仍 error=Internal Server Error（行为不变）', () => {
    const { filter } = createFilter();
    const { host, sent } = createHost({ url: '/boom', method: 'GET', id: 15 });

    filter.catch(new Error('db exploded'), host);

    expect(sent.status).toBe(500);
    expect(sent.body?.error).toBe('Internal Server Error');
    expect(sent.body?.message).toBe('Internal server error');
  });
});

import 'reflect-metadata';
import {
  Controller,
  ForbiddenException,
  HttpException,
  Module,
  NotFoundException,
} from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { oc } from '@orpc/contract';
import { Impl, ORPCModule } from '@orpc/nest';
import { openapi } from '@orpc/openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CommonModule } from '../common.module';
import { os } from './orpc';
import { restErrorStatusMap } from './rest-error.middleware';
import { restErrorResponseBodyEncoder } from './rest-error.serializer';

/**
 * 换轨 WP-D 错误面**线上等价**集成测（零 DB·进默认 CI）：真起 Nest+Fastify（仅 CommonModule 的全局
 * 过滤器/拦截器 + `ORPCModule.forRoot({ customErrorResponseBodyEncoder })`·无任何守卫/DB），用一组
 * `@Impl` 探针 procedure 在 handler 内抛异常，经完整链——
 *   中间件归一 → oRPC `encodeError`（状态由 code 复原）→ `ImplementInterceptor` 对 `status>=300` 对象体
 *   重抛 `HttpException(body,status)` → 既有 `HttpExceptionFilter` 补 statusCode/path/requestId/timestamp
 * ——断言产出的错误体与旧 REST 面**逐字同形**（含 errorCode / standard-schema 400 errors[] / 500 不泄露）。
 * 这是「in-handler 404→500 退化」已被 WP-D 消除的运行时铁证（守卫层 401/403 parity 已在 WP-B e2e 覆盖）。
 */
const notFoundContract = oc.meta(openapi({ method: 'GET', path: '/probe-not-found' }));
const forbiddenCodeContract = oc.meta(openapi({ method: 'GET', path: '/probe-forbidden-code' }));
const validateContract = oc
  .input(z.object({ q: z.string().min(1) }))
  .meta(openapi({ method: 'GET', path: '/probe-validate' }));
const leakContract = oc.meta(openapi({ method: 'GET', path: '/probe-leak' }));
const teapotContract = oc.meta(openapi({ method: 'GET', path: '/probe-teapot' }));

@Controller()
class ProbeController {
  @Impl(notFoundContract)
  notFound() {
    return os.meta(openapi({ method: 'GET', path: '/probe-not-found' })).handler(() => {
      throw new NotFoundException('Post not found');
    });
  }

  @Impl(forbiddenCodeContract)
  forbiddenCode() {
    return os.handler(() => {
      throw new ForbiddenException({ message: 'seat limit reached', errorCode: 'SEAT_LIMIT' });
    });
  }

  @Impl(validateContract)
  validate() {
    return os.input(z.object({ q: z.string().min(1) })).handler(() => ({ ok: true }));
  }

  @Impl(leakContract)
  leak() {
    return os.handler(() => {
      // 模拟 DB 驱动/连接层裸 Error 泄露（含 SQL 片段）：WP-D 后须被兜底 500 收敛·不外泄。
      throw new Error('duplicate key value violates unique constraint "users_email_idx"');
    });
  }

  @Impl(teapotContract)
  teapot() {
    return os.handler(() => {
      // 故意用 common 码表**外**的状态（418·非 Nest HttpStatus 具名成员）验 WP-D 通配码 HTTP_418 逐字复原。
      throw new HttpException('I am a teapot', 418);
    });
  }
}

@Module({
  imports: [
    CommonModule,
    ORPCModule.forRoot({
      customErrorResponseBodyEncoder: restErrorResponseBodyEncoder,
      errorStatusMap: restErrorStatusMap,
    }),
  ],
  controllers: [ProbeController],
})
class ProbeModule {}

interface ErrorEnvelope {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId: string;
  errorCode?: string;
  errors?: { path?: string; message: string }[];
}

describe('WP-D oRPC 错误面线上等价（零 DB 集成·逐字 REST 信封）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('in-handler NotFoundException → 404·逐字信封（statusCode/message/error/path/requestId/timestamp）', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe-not-found' });
    expect(res.statusCode).toBe(404);
    const body = res.json() as ErrorEnvelope;
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('Post not found');
    expect(body.error).toBe('Not Found');
    expect(body.path).toBe('/probe-not-found');
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId).toBeTruthy();
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    // 旧面 404 无 errorCode/errors：不得凭空多出 oRPC 味字段（defined/code/status/data）。
    expect(body).not.toHaveProperty('defined');
    expect(body).not.toHaveProperty('code');
    expect(body).not.toHaveProperty('data');
  });

  it('业务 ForbiddenException 携 errorCode → 403·errorCode 逐字承接', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe-forbidden-code' });
    expect(res.statusCode).toBe(403);
    const body = res.json() as ErrorEnvelope;
    expect(body.statusCode).toBe(403);
    expect(body.message).toBe('seat limit reached');
    expect(body.error).toBe('Forbidden');
    expect(body.errorCode).toBe('SEAT_LIMIT');
    expect(body.path).toBe('/probe-forbidden-code');
  });

  it('standard-schema 校验失败（GET 缺必填 query）→ 400·message 数组 + errors[]{path,message} + Bad Request', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe-validate' });
    expect(res.statusCode).toBe(400);
    const body = res.json() as ErrorEnvelope;
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(Array.isArray(body.message)).toBe(true);
    expect((body.message as string[]).length).toBeGreaterThan(0);
    expect(body.errors).toBeInstanceOf(Array);
    expect(body.errors?.[0]).toMatchObject({ path: 'q' });
    expect(typeof body.errors?.[0]?.message).toBe('string');
  });

  it('in-handler 表外状态 HttpException(418) → 418·状态经通配码 HTTP_418 复原·逐字 message', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe-teapot' });
    expect(res.statusCode).toBe(418);
    const body = res.json() as ErrorEnvelope;
    expect(body.statusCode).toBe(418);
    expect(body.message).toBe('I am a teapot');
    expect(body.error).toBe("I'm a Teapot");
    expect(body.path).toBe('/probe-teapot');
  });

  it('裸 Error（含 SQL 泄露）→ 500·收敛为通用信封·不外泄原文', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe-leak' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as ErrorEnvelope;
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(body.error).toBe('Internal Server Error');
    expect(res.body).not.toMatch(/users_email_idx|duplicate key/i);
  });
});

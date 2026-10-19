import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CommonModule } from '../common/common.module';
import { createValidationPipe } from '../common/validation-pipe';
import { AppI18nModule } from './i18n.module';

// 本地 probe DTO：自 module-users-surface-reduction（Users 面收紧删 CreateUserDto）起，
// 本契约测不再寄居生产 DTO——显式 validate.* 键即被测面本身（翻译链 + S9 paramtypes 锁）。
class ProbeDto {
  @IsEmail({}, { message: 'validate.email.invalid' })
  @IsNotEmpty({ message: 'validate.email.required' })
  readonly email: string;
}

@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() dto: ProbeDto) {
    return { ok: true, email: dto.email };
  }
}

// S4/S5 共存式换轨探针：同一模块下并挂一个 `@Body({ schema })` 路由，断言其校验失败产出的
// HTTP 错误外形与上面 class-validator 探针**逐字同形**（顶层 message 数组 + errors[] 明细 + i18n）。
// 组合管对带 schema 的参数走官方 StandardSchemaValidationPipe（自定 exceptionFactory 抛
// StandardSchemaValidationException），由 CommonModule 注册的 S5 过滤器渲染。
const probeSchema = z
  .object({ email: z.string().email({ error: 'validate.email.invalid' }) })
  .strict();

@Controller('probe-schema')
class ProbeSchemaController {
  @Post()
  create(@Body({ schema: probeSchema }) dto: { email: string }) {
    return { ok: true, email: dto.email };
  }
}

@Module({
  imports: [AppI18nModule, CommonModule],
  controllers: [ProbeController, ProbeSchemaController],
})
class ProbeModule {}

// Contract test for L1 stage B: validation messages are localized via nestjs-i18n while
// the HTTP error response keeps the project's existing shape
// (statusCode / message / error / timestamp / path). Also locks the APP_FILTER precedence
// (i18n validation filter must win over the catch-all HttpExceptionFilter).
describe('Validation i18n localization (contract)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // 与生产入口共用单一装配源（global-ci-fullstack-pg 切片 A′ 消双源漂移）。
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (lang?: string) =>
    app.inject({
      method: 'POST',
      url: '/probe',
      payload: { email: 'not-an-email' },
      headers: lang ? { 'accept-language': lang } : {},
    });

  it('keeps ProbeDto in design:paramtypes so @Body validation runs', () => {
    // Guards the SWC/`import type` erasure pitfall: without the value import the global
    // pipe sees no metatype and silently skips validation (would return 2xx).
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      ProbeController.prototype,
      'create',
    ) as unknown[];
    expect(paramTypes[0]).toBe(ProbeDto);
  });

  it('localizes to zh and preserves the response contract', async () => {
    const res = await post('zh');
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain('请输入正确的邮箱');
    expect(body.error).toBe('Bad Request');
    // Shape preserved: timestamp + path present (proves the custom formatter ran,
    // not the raw nestjs-i18n default body and not the untranslated-key passthrough).
    expect(typeof body.timestamp).toBe('string');
    expect(body.path).toBe('/probe');
    // requestId 契约同步锁：本装配不经 main.ts hook，故走兜底链第二级（Fastify 原生 request.id）
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
    // 不为校验失败预填 errorCode（裁决点丙）
    expect('errorCode' in body).toBe(false);
    // errors[]（丙裁）：字段级结构化明细存在，path=property，message 与顶层译文同源
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].path).toBe('email');
    expect(body.errors[0].message).toContain('请输入正确的邮箱');
  });

  it('localizes to en via accept-language', async () => {
    const body = JSON.parse((await post('en')).body);
    expect(body.message).toContain('Please enter a valid email address');
  });

  it('falls back to zh when no accept-language header is sent', async () => {
    const body = JSON.parse((await post()).body);
    expect(body.message).toContain('请输入正确的邮箱');
  });

  // ── S4/S5：官方 standard-schema 路由与 class-validator 路由逐字同形 ──
  const postSchema = (
    lang?: string,
    payload: Record<string, unknown> = { email: 'not-an-email' },
  ) =>
    app.inject({
      method: 'POST',
      url: '/probe-schema',
      payload,
      headers: lang ? { 'accept-language': lang } : {},
    });

  it('schema 路由：本地化到 zh 且保留同形响应契约', async () => {
    const res = await postSchema('zh');
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain('请输入正确的邮箱');
    expect(body.error).toBe('Bad Request');
    expect(typeof body.timestamp).toBe('string');
    expect(body.path).toBe('/probe-schema');
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
    expect('errorCode' in body).toBe(false);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].path).toBe('email');
    expect(body.errors[0].message).toContain('请输入正确的邮箱');
  });

  it('schema 路由：en 本地化', async () => {
    const body = JSON.parse((await postSchema('en')).body);
    expect(body.message).toContain('Please enter a valid email address');
  });

  it('schema 路由：合法载荷放行（不触发校验错误）', async () => {
    const res = await postSchema('zh', { email: 'a@b.com' });
    expect(res.statusCode).toBe(201);
    // 成功面经 TransformInterceptor 包信封（{data,message,statusCode}）·此处只校验载荷放行且 schema transform 生效
    expect(JSON.parse(res.body).data).toEqual({ ok: true, email: 'a@b.com' });
  });

  it('schema 路由：strict 拒未知字段（复刻 forbidNonWhitelisted）', async () => {
    const res = await postSchema('zh', { email: 'a@b.com', sneaky: 1 });
    expect(res.statusCode).toBe(400);
  });
});

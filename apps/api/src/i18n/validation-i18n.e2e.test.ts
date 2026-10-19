import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CommonModule } from '../common/common.module';
import { createValidationPipe } from '../common/validation-pipe';
import { AppI18nModule } from './i18n.module';

// S9 收官（global-validation-zod-constitution-amendment）：class-validator 探针随依赖摘除一并删除，
// 本契约测收敛为「官方 standard-schema 路由的 i18n 本地化 + 逐字同形响应契约」单侧断言——这已是
// 生产唯一校验路径（全部请求面经 `@Body({ schema })`·class DTO 于 S3b 删尽），旧 class-validator
// 对拍支不再存在。探针 schema 每节点显式挂 `error:` i18n key（未挂则漏 zod 默认英文·S0-G3）。
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
  controllers: [ProbeSchemaController],
})
class ProbeModule {}

// Contract test：校验消息经 nestjs-i18n 本地化，同时 HTTP 错误响应保持项目既有外形
// (statusCode / message / error / timestamp / path)。并锁 APP_FILTER 优先级
//（standard-schema 校验过滤器须先于兜底 HttpExceptionFilter 命中）。
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

  it('schema 路由：en 本地化', async () => {
    const body = JSON.parse((await postSchema('en')).body);
    expect(body.message).toContain('Please enter a valid email address');
  });

  it('schema 路由：无 accept-language 回落 zh', async () => {
    const body = JSON.parse((await postSchema()).body);
    expect(body.message).toContain('请输入正确的邮箱');
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

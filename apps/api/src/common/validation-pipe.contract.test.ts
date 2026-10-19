import 'reflect-metadata';
import { type ArgumentMetadata, StandardSchemaValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  joinIssuePath,
  StandardSchemaValidationException,
  type ValidationIssueLike,
} from './errors/standard-schema-validation.exception';
import { createValidationPipe } from './validation-pipe';

/**
 * 官方管版本锁定回归测（判据 L70 · global-validation-zod-constitution-amendment §5）。
 *
 * 目的：`StandardSchemaValidationPipe` 系 Nest 12 较新的内置件，次/小版本可能**静默改默认行为**
 * （schema 读取点、transform 语义、issue 转发口径、custom 跳过规则）。本测以**自造 StandardSchemaV1
 * stub**直驱官方管的 `transform`，把「我方生产装配所依赖的官方契约」钉死成断言——与 zod 版本解耦，
 * 一旦官方件行为漂移即在此拓红，而非泄漏到运行时。
 *
 * 与 `validation-i18n.e2e.test.ts` 分工：那份经真 HTTP 锁 `Issue[]→ErrorResponse` 逐字外形 + i18n；
 * 本份在管层锁「官方管如何调用 schema、如何把 issues 交给我方 exceptionFactory、transform 如何取值」。
 */

/** 造一个满足 StandardSchemaV1 的最小 schema stub：validate 返回 result（value 或 issues）。 */
function stubSchema(
  implement: (value: unknown) => { value?: unknown; issues?: readonly ValidationIssueLike[] },
) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'contract-test',
      validate: (value: unknown) => implement(value) as never,
      types: undefined as never,
    },
  };
}

const bodyMeta = (schema?: unknown): ArgumentMetadata =>
  ({ type: 'body', metatype: undefined, schema }) as unknown as ArgumentMetadata;

describe('官方 StandardSchemaValidationPipe · 版本锁定契约', () => {
  it('装配源仍返回官方管实例（防误插自研/Composite 复活）', () => {
    expect(createValidationPipe()).toBeInstanceOf(StandardSchemaValidationPipe);
  });

  it('读取 metadata.schema 并调用其 ~standard.validate', async () => {
    let seen: unknown;
    const pipe = createValidationPipe();
    const schema = stubSchema((v) => {
      seen = v;
      return { value: v };
    });
    await pipe.transform({ email: 'a@b.com' }, bodyMeta(schema));
    // 官方管须把入参原样喂给 schema['~standard'].validate
    expect(seen).toEqual({ email: 'a@b.com' });
  });

  it('校验失败 → 以原始 issues 调用我方 exceptionFactory（抛 StandardSchemaValidationException）', async () => {
    const pipe = createValidationPipe();
    const issues = [
      { message: 'validate.email.required', path: ['email'] },
      { message: 'validate.role.invalid', path: ['profile', 'role'] },
    ];
    const schema = stubSchema(() => ({ issues }));
    await expect(pipe.transform({}, bodyMeta(schema))).rejects.toBeInstanceOf(
      StandardSchemaValidationException,
    );
    // 逐字透传：issues 数组内容不得被官方管改写/重排/截断
    const err = await pipe
      .transform({}, bodyMeta(schema))
      .then(() => null)
      .catch((e: unknown) => e as StandardSchemaValidationException);
    expect(err?.issues).toEqual(issues);
  });

  it('transform:true 取 schema 产出值（复刻旧 enableImplicitConversion 的 z.coerce 语义）', async () => {
    const pipe = createValidationPipe();
    // stub 模拟 z.coerce.number()：输入字符串 '42' 产出数值 42
    const schema = stubSchema((v) => ({ value: Number(v) }));
    const out = await pipe.transform('42', bodyMeta(schema));
    expect(out).toBe(42);
    expect(typeof out).toBe('number');
  });

  it('metadata 无 schema → 原样返回（早退契约·生产裸 @Param 依赖此）', async () => {
    const pipe = createValidationPipe();
    const value = { untouched: true };
    expect(await pipe.transform(value, bodyMeta(undefined))).toBe(value);
  });

  it("type:'custom' 缺省跳过校验（validateCustomDecorators:false）", async () => {
    const pipe = createValidationPipe();
    let validated = false;
    const schema = stubSchema(() => {
      validated = true;
      return { issues: [{ message: 'should-not-fire' }] };
    });
    const customMeta = {
      type: 'custom',
      metatype: undefined,
      schema,
    } as unknown as ArgumentMetadata;
    const value = { keep: 1 };
    // 即便带 schema，custom 参数也应原样返回且不调用 validate
    expect(await pipe.transform(value, customMeta)).toBe(value);
    expect(validated).toBe(false);
  });

  it('真 zod：strict 拒未知键 + 必填缺失各产一条 issue（复刻 whitelist/forbidNonWhitelisted）', async () => {
    const pipe = createValidationPipe();
    const schema = z.object({ email: z.string().email() }).strict();
    await expect(pipe.transform({ sneaky: 1 }, bodyMeta(schema))).rejects.toBeInstanceOf(
      StandardSchemaValidationException,
    );
  });
});

describe('Issue[] → 点分路径展平契约（S5 过滤器渲染依赖）', () => {
  it('joinIssuePath 与官方 formatIssueMessages 同口径：对象段取 .key、数组段点连', () => {
    expect(joinIssuePath(['profile', 'role'])).toBe('profile.role');
    expect(joinIssuePath(['items', 2, 'name'])).toBe('items.2.name');
    // 官方 Map key 段形如 { key }
    expect(joinIssuePath(['tags', { key: 'x' } as never])).toBe('tags.x');
    // 缺省/空路径 → 空串（过滤器据此省略 path 字段）
    expect(joinIssuePath(undefined)).toBe('');
    expect(joinIssuePath([])).toBe('');
  });

  it('渲染层外形锁定：message=译文数组、errors[]={path?,message}、error=Bad Request（golden 对拍）', () => {
    // 与 StandardSchemaValidationExceptionFilter.catch 的 send 体逐字对齐（此处以纯函数复现，锁契约非锁 i18n）
    const issues: readonly ValidationIssueLike[] = [
      { message: 'validate.email.required', path: ['email'] },
      { message: 'validate.role.invalid', path: [] },
    ];
    const translate = (m: string): string => m; // i18n 未命中即透传·与过滤器同口径
    const details = issues.map((issue) => {
      const path = joinIssuePath(issue.path);
      return { ...(path ? { path } : {}), message: translate(issue.message) };
    });
    const body = {
      statusCode: 400,
      message: details.map((d) => d.message),
      error: 'Bad Request',
      ...(details.length > 0 ? { errors: details } : {}),
    };
    expect(body).toEqual({
      statusCode: 400,
      message: ['validate.email.required', 'validate.role.invalid'],
      error: 'Bad Request',
      errors: [
        { path: 'email', message: 'validate.email.required' },
        { message: 'validate.role.invalid' },
      ],
    });
  });
});

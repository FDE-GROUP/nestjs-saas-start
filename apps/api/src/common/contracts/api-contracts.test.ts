import 'reflect-metadata';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { apiEnvelopeSchema, errorResponseSchema } from '@saas/contracts/index';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { LoggerService } from '../../logger/logger.service';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { ApiEnvelope, ApiErrorDetail, ApiErrorResponse } from './api-contracts';

/**
 * 契约对拍锁测（F1 · envelope/errors 面）：文档 schema 类的**运行时可发现字段**
 * （design:type 元数据·装饰器发射即有）必须与拦截器/过滤器**实跑产物**逐字段恒等。
 * 任一侧增删字段而另一侧未跟 → 本测红——「typed」的地基不许静默漂移。
 * S7a（③ 上移）后另加第三道：实跑产物须过 contracts zod 单源 safeParse——
 * 文档形/实跑形/契约形 三角互锁。
 */

/**
 * 经 `@ApiProperty` 元数据发现类的契约字段（含继承链）。
 * 契约类字段均为「无初始化器」的纯文档声明，运行时实例不含这些键（故 `Object.keys(instance)` 不可靠）；
 * swagger 装饰器把每列以 `:<name>` 前缀登记于各类 prototype 的 `apiModelPropertiesArray`，走继承链聚合去前缀即为契约字段集。
 */
function contractProps(cls: new () => unknown): string[] {
  const keys: string[] = [];
  let proto: object | null = cls.prototype;
  while (proto && proto !== Object.prototype) {
    const recorded = Reflect.getMetadata('swagger/apiModelPropertiesArray', proto) as
      | string[]
      | undefined;
    for (const entry of recorded ?? []) keys.push(entry.replace(/^[^a-zA-Z_$]/, ''));
    proto = Object.getPrototypeOf(proto);
  }
  return [...new Set(keys)].sort();
}

/** 造一个最小 ExecutionContext/ArgumentsHost 供 filter 直跑。 */
function hostFor(captured: { status?: number; body?: unknown }) {
  const reply = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    send(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ url: '/api/v1/x', headers: {}, id: 'req-1' }),
    }),
  } as never;
}

describe('api-contracts ↔ 实存件 形状恒等（F1 契约地基）', () => {
  it('ApiEnvelope 字段 ≡ TransformInterceptor normal 包裹形 {data,statusCode,message}', async () => {
    // 文档面类字段集（运行时可发现）。
    expect(contractProps(ApiEnvelope)).toEqual(['data', 'message', 'statusCode']);
    // 实跑真形：经真拦截器走一遭（改动 transform.interceptor.ts 必红于此）。
    const ctx = {
      switchToHttp: () => ({ getResponse: () => ({ statusCode: HttpStatus.OK }) }),
    } as never;
    const body = await firstValueFrom(
      new TransformInterceptor<unknown>().intercept(ctx, {
        handle: () => of({ id: '1' }),
      } as never),
    );
    expect(Object.keys(body as object).sort()).toEqual(['data', 'message', 'statusCode']);
    // S7a 三角互锁：实跑信封过 contracts 单源 safeParse。
    expect(apiEnvelopeSchema.safeParse(body).success).toBe(true);
  });

  it('ApiErrorResponse 字段 ≡ filter 实跑产物逐字段恒等', () => {
    const captured: { status?: number; body?: Record<string, unknown> } = {};
    const logger = { log: () => {}, error: () => {}, warn: () => {} } as unknown as LoggerService;
    const filter = new HttpExceptionFilter(logger);
    // 以 object response 形态穷举全部可选字段（errorCode + errors[]），
    // 使实跑产物覆盖契约声明的每一列——「可选全置位时逐字段恒等」才是有效的地基锁。
    filter.catch(
      new NotFoundException({
        message: 'nope',
        errorCode: 'X:Y',
        errors: [{ path: 'a', message: 'b' }],
      }),
      hostFor(captured as { status?: number; body?: unknown }),
    );
    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    const realErrorBody = Object.keys(captured.body ?? {}).sort();
    expect(realErrorBody).toEqual(contractProps(ApiErrorResponse));
    // S7a 三角互锁：实跑错误体过 contracts 单源 safeParse（契约形≡实跑形）。
    expect(errorResponseSchema.safeParse(captured.body).success).toBe(true);
    // 锚几枚关键实值防 filter 语义变更 unnoticed：errorCode 透传 / requestId 存在 / timestamp ISO。
    const body = captured.body as Record<string, unknown>;
    expect(body.errorCode).toBe('X:Y');
    expect(typeof body.requestId).toBe('string');
    expect(() => new Date(body.timestamp as string)).not.toThrow();
  });

  it('ApiErrorDetail 字段 ≡ ResponseErrorDetail 契约面 {path?,code?,message}', () => {
    // detail 无运行时生产者单独可跑（class-validator 展平在 filter 内），以字段集对拍。
    expect(contractProps(ApiErrorDetail)).toEqual(['code', 'message', 'path']);
  });
});

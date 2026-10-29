import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PaymentController } from './payment.controller';

/**
 * REST 一致性核验片（项③）：反射锁支付面响应状态码**元数据**。`webhook`（carve-out·保留 REST）
 * `@HttpCode(OK)` → 元数据 200（入站回调 ack 非新建资源·PSP 期望 2xx）。
 * 换轨 WP-C 后五常规路由转 per-method `@Impl`——`@Impl` 恒施加 `HttpCode(successStatus ?? 200)`，
 * 故 `customers`/`checkouts`/`refund` 资源创建三面经 meta `successStatus: CREATED` 显式落元数据 **201**
 * （复刻旧 POST 默认 201·防 @Impl 默认 200 静默降格）。
 */
const codeOf = (method: (...args: never[]) => unknown): number | undefined =>
  Reflect.getMetadata(HTTP_CODE_METADATA, method as unknown as object) as number | undefined;

describe('PaymentController 响应状态码（REST 一致性·项③）', () => {
  it('webhook 200（ack 非新建·carve-out 保留 REST @HttpCode(OK)）', () => {
    expect(codeOf(PaymentController.prototype.handleWebhook)).toBe(HttpStatus.OK);
  });

  it('customers/checkouts/refund 经 @Impl successStatus:CREATED 显式落 201（资源创建语义·防降格 200）', () => {
    for (const m of ['createCustomer', 'createCheckout', 'refund'] as const) {
      expect(codeOf(PaymentController.prototype[m]), m).toBe(HttpStatus.CREATED);
    }
  });

  it('test/retrieveCheckout GET 经 @Impl 施加 200（读面无资源创建语义）', () => {
    for (const m of ['test', 'retrieveCheckout'] as const) {
      expect(codeOf(PaymentController.prototype[m]), m).toBe(HttpStatus.OK);
    }
  });
});

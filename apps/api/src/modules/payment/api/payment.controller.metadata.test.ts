import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PaymentController } from './payment.controller';

/**
 * REST 一致性核验片（项③）：反射锁支付面响应状态码**元数据**。`webhook` 曾漏配 `@HttpCode` →
 * 运行时默认 201 与 OpenAPI 文档 200 drift（入站回调 ack 非新建资源·PSP 期望 2xx）；本锁钉其为 200。
 * `customers`/`checkouts`/`refund` 系真·资源/引用创建，循 POST 默认 201（不显式配 `@HttpCode`）——
 * 锁「未定义」以固化该契约选择，防误加 `@HttpCode(OK)` 或反向回退。
 */
const codeOf = (method: (...args: never[]) => unknown): number | undefined =>
  Reflect.getMetadata(HTTP_CODE_METADATA, method as unknown as object) as number | undefined;

describe('PaymentController 响应状态码（REST 一致性·项③）', () => {
  it('webhook 200（ack 非新建·对齐 OpenAPI 文档）', () => {
    expect(codeOf(PaymentController.prototype.handleWebhook)).toBe(HttpStatus.OK);
  });

  it('customers/checkouts/refund 未显式配 @HttpCode（循 POST 默认 201·资源创建语义）', () => {
    for (const m of ['createCustomer', 'createCheckout', 'refund'] as const) {
      expect(codeOf(PaymentController.prototype[m]), m).toBeUndefined();
    }
  });
});

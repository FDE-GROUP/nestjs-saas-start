import { z } from 'zod';
import { strictObject } from '../strict';

// 旧 payment DTO 各字段均无自定义 message（校验失败走 class-validator 默认英文·原样透传），
// 故此处不设 `error:`，保持「非 key 消息」语义不变；数值字段用 `z.coerce.number()` 复刻全局管的
// `enableImplicitConversion`（@Body JSON 正常已为 number，coerce 仅对显式数字串宽容一档·与旧行为一致）。

/**
 * 创建 checkout（支付意图）入参（旧 `CreateCheckoutDto`）。
 *
 * @public
 */
export const createCheckoutSchema = strictObject({
  amount: z.coerce.number().min(1),
  currency: z.string().min(1).max(10),
  description: z.string().max(20000).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type CreateCheckout = z.infer<typeof createCheckoutSchema>;

/**
 * 创建 provider customer 入参（旧 `CreateCustomerDto`·`email` 旧 `@IsEmail` 校验格式）。
 *
 * @public
 */
export const createCustomerSchema = strictObject({
  email: z.string().email().max(254),
  name: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type CreateCustomer = z.infer<typeof createCustomerSchema>;

/**
 * 退款入参（旧 `RefundPaymentDto`·amount 省略即全额退）。
 *
 * @public
 */
export const refundPaymentSchema = strictObject({
  checkoutId: z.string().min(1).max(128),
  amount: z.coerce.number().min(1).optional(),
  reason: z.string().max(20000).optional(),
});
export type RefundPayment = z.infer<typeof refundPaymentSchema>;

/**
 * 取回 checkout 路径参（换轨 WP-C·旧 `GET /payment/checkouts/:id` 的 `@Param('id')`·紧凑 input 结构 params 对象）。
 * @public
 */
export const paymentCheckoutIdParamSchema = strictObject({
  id: z.string().min(1).max(128),
});
export type PaymentCheckoutIdParam = z.infer<typeof paymentCheckoutIdParamSchema>;

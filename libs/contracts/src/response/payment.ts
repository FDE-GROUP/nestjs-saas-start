import { z } from 'zod';

/**
 * 支付面响应契约（S7b·真相源 = `PaymentService` 各方法返回类型 `Payment*Ref`）。
 * 通道词汇单源 = `@core` payment.interface `PaymentProviderId`·此处内联字面量由
 * contracts-vocab-parity 对拍锁漂移；`raw` 为通道原生载荷透传（自由值·不假精确·
 * 对齐 apiOkPassthrough 的诚实纪律——strip 只作用于本 schema 声明层，不深入 raw 值）。
 */

/**
 * 支付通道 wire 值集（内联单源·漂移由 contracts-vocab-parity 对拍锁）。
 *
 * @public
 */
export const PAYMENT_PROVIDER_VALUES = ['stripe', 'alipay', 'wechat_pay'] as const;

/**
 * `GET /payment/test`：内联字面返回 `{status:'ok', selected, available}`。
 *
 * @public
 */
export const paymentStatusSchema = z.object({
  status: z.literal('ok'),
  /** 当前选定通道。 */
  selected: z.enum(PAYMENT_PROVIDER_VALUES),
  /** 可用通道集合。 */
  available: z.array(z.enum(PAYMENT_PROVIDER_VALUES)),
});
export type PaymentStatusView = z.infer<typeof paymentStatusSchema>;

/**
 * 支付 customer 引用（`PaymentCustomerRef`·通道侧客户）。
 *
 * @public
 */
export const paymentCustomerRefSchema = z.object({
  /** 通道侧 customer id。 */
  id: z.string(),
  providerId: z.enum(PAYMENT_PROVIDER_VALUES),
  email: z.string(),
  /** 通道原生载荷透传。 */
  raw: z.unknown(),
});

/**
 * 结账/支付意图引用（`PaymentCheckoutRef`·含前端确认所需的 clientSecret）。
 *
 * @public
 */
export const paymentCheckoutRefSchema = z.object({
  /** checkout / payment intent id。 */
  id: z.string(),
  providerId: z.enum(PAYMENT_PROVIDER_VALUES),
  /** 通道侧状态串。 */
  status: z.string().optional(),
  /** 客户端密钥（前端确认支付用）。 */
  clientSecret: z.string().optional(),
  raw: z.unknown(),
});

/**
 * 退款引用（`PaymentRefundRef`）。
 *
 * @public
 */
export const paymentRefundRefSchema = z.object({
  /** refund id。 */
  id: z.string(),
  providerId: z.enum(PAYMENT_PROVIDER_VALUES),
  status: z.string().optional(),
  /** 退款金额（最小货币单位）。 */
  amount: z.number().optional(),
  raw: z.unknown(),
});

/**
 * `POST /payment/webhooks`：内联字面返回 `{received:true}`。
 *
 * @public
 */
export const webhookAckSchema = z.object({
  /** 回调是否已接收处理。 */
  received: z.boolean(),
});

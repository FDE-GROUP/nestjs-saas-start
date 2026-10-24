import { ApiProperty } from '@nestjs/swagger';
import type {
  paymentCheckoutRefSchema,
  paymentCustomerRefSchema,
  paymentRefundRefSchema,
  paymentStatusSchema,
  webhookAckSchema,
} from '@saas/contracts/index';
import type { z } from 'zod';
import type {
  PaymentCheckoutRef,
  PaymentCustomerRef,
  PaymentProviderId,
  PaymentRefundRef,
} from '../../domain/ports/payment-provider.port';

/**
 * 支付面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 真相源 = `PaymentService` 各方法返回类型（Payment*Ref）；漂移防线：文末编译期双向赋值锁。
 * 通道词汇单源 = `@core` payment.interface PaymentProviderId；`raw` 为通道原生载荷透传
 * （自由对象·不假精确，对齐 apiOkPassthrough 的诚实纪律）。
 */
const PROVIDER_VALUES = ['stripe', 'alipay', 'wechat_pay'] as const;

/**
 * 支付状态响应契约（`GET /payment/test`）：内联字面返回 `{status:'ok', ...describe()}`（无独立真相源类型·不作双向锁）。
 * @public
 */
export class PaymentStatusResponse {
  @ApiProperty({ enum: ['ok'], description: '集成状态恒 "ok"。' })
  status!: 'ok';

  @ApiProperty({ enum: PROVIDER_VALUES, description: '当前选定通道。' })
  selected!: PaymentProviderId;

  @ApiProperty({
    isArray: true,
    enum: PROVIDER_VALUES,
    description: '可用通道集合。',
  })
  available!: PaymentProviderId[];
}

/**
 * 支付客户引用响应契约（跨通道归一化 + `raw` 透传）。
 * @public
 */
export class PaymentCustomerRefResponse {
  @ApiProperty({ description: '通道侧 customer id。' })
  id!: string;

  @ApiProperty({ enum: PROVIDER_VALUES, description: '所属通道。' })
  providerId!: PaymentProviderId;

  @ApiProperty()
  email!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '通道原生载荷透传。',
  })
  raw!: unknown;
}

const _pcrf: PaymentCustomerRefResponse = {} as PaymentCustomerRef;
const _pcrb: PaymentCustomerRef = {} as PaymentCustomerRefResponse;
void _pcrf;
void _pcrb;

/**
 * 支付结账引用响应契约（含可选 clientSecret 供前端确认支付）。
 * @public
 */
export class PaymentCheckoutRefResponse {
  @ApiProperty({ description: 'checkout / payment intent id。' })
  id!: string;

  @ApiProperty({ enum: PROVIDER_VALUES, description: '所属通道。' })
  providerId!: PaymentProviderId;

  @ApiProperty({ required: false, description: '通道侧状态串。' })
  status?: string;

  @ApiProperty({ required: false, description: '客户端密钥（前端确认支付用）。' })
  clientSecret?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '通道原生载荷透传。',
  })
  raw!: unknown;
}

const _pckf: PaymentCheckoutRefResponse = {} as PaymentCheckoutRef;
const _pckb: PaymentCheckoutRef = {} as PaymentCheckoutRefResponse;
void _pckf;
void _pckb;

/**
 * 支付退款引用响应契约（跨通道归一化 + `raw` 透传）。
 * @public
 */
export class PaymentRefundRefResponse {
  @ApiProperty({ description: 'refund id。' })
  id!: string;

  @ApiProperty({ enum: PROVIDER_VALUES, description: '所属通道。' })
  providerId!: PaymentProviderId;

  @ApiProperty({ required: false, description: '通道侧状态串。' })
  status?: string;

  @ApiProperty({ required: false, description: '退款金额（最小货币单位）。' })
  amount?: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '通道原生载荷透传。',
  })
  raw!: unknown;
}

const _prf: PaymentRefundRefResponse = {} as PaymentRefundRef;
const _prb: PaymentRefundRef = {} as PaymentRefundRefResponse;
void _prf;
void _prb;

/**
 * 支付 Webhook 回调 ack 响应契约（`POST /payment/webhooks`）：内联字面返回 `{received:true}`（无独立真相源类型·不作双向锁）。
 * @public
 */
export class WebhookAckResponse {
  @ApiProperty({ description: '回调是否已接收处理。' })
  received!: boolean;
}

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源/内联字面形。——
const _pkc1: z.infer<typeof paymentCustomerRefSchema> = {} as PaymentCustomerRef;
const _pkc2: PaymentCustomerRef = {} as z.infer<typeof paymentCustomerRefSchema>;
const _pko1: z.infer<typeof paymentCheckoutRefSchema> = {} as PaymentCheckoutRef;
const _pko2: PaymentCheckoutRef = {} as z.infer<typeof paymentCheckoutRefSchema>;
const _pkr1: z.infer<typeof paymentRefundRefSchema> = {} as PaymentRefundRef;
const _pkr2: PaymentRefundRef = {} as z.infer<typeof paymentRefundRefSchema>;
const _pks1: z.infer<typeof paymentStatusSchema> = {} as PaymentStatusResponse;
const _pks2: PaymentStatusResponse = {} as z.infer<typeof paymentStatusSchema>;
const _pkw1: z.infer<typeof webhookAckSchema> = {} as WebhookAckResponse;
void _pkc1;
void _pkc2;
void _pko1;
void _pko2;
void _pkr1;
void _pkr2;
void _pks1;
void _pks2;
void _pkw1;

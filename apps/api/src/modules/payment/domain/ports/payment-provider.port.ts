/**
 * PaymentProvider 统一端口（global-cn-adaptation D1/P1）。
 *
 * 与 `StorageProvider` 同构：领域只依赖本接口，具体通道（stripe/alipay/wechat_pay）
 * 由 `PaymentModule.register()` 依配置装配、`PaymentService` 依 `payment.provider` 选择。
 * 返回体为跨通道归一化引用 + `raw` 透传原生载荷，便于既有调用方渐进迁移。
 *
 * 分层对齐：原居 `providers/payment.interface.ts`，现下沉 `domain/ports`（零框架依赖）。
 * 签名属方案 §6.1 草案，随 P2/P3 通道接入在代码评审处定稿。
 */
export type PaymentProviderId = 'stripe' | 'alipay' | 'wechat_pay';

export interface PaymentCustomerInput {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutInput {
  /** 最小货币单位金额（如分为单位）。 */
  amount: number;
  /** 三位 ISO 货币码。 */
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface RefundInput {
  checkoutId: string;
  amount?: number;
  reason?: string;
}

export interface PaymentCustomerRef {
  id: string;
  providerId: PaymentProviderId;
  email: string;
  raw: unknown;
}

export interface PaymentCheckoutRef {
  id: string;
  providerId: PaymentProviderId;
  status?: string;
  clientSecret?: string;
  raw: unknown;
}

export interface PaymentRefundRef {
  id: string;
  providerId: PaymentProviderId;
  status?: string;
  amount?: number;
  raw: unknown;
}

export interface NormalizedPaymentEvent {
  providerId: PaymentProviderId;
  type: string;
  data: unknown;
  raw: unknown;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;

  /** 能力门：是否支持周期扣款/订阅（ stripe=true；境内代扣依签约能力，见 P3）。 */
  supportsRecurring(): boolean;

  createCustomer(input: PaymentCustomerInput): Promise<PaymentCustomerRef>;

  /** 下单/收款意图（stripe 映射 PaymentIntent，境内映射预授权/下单）。 */
  createCheckout(input: CreateCheckoutInput): Promise<PaymentCheckoutRef>;

  retrieveCheckout(id: string): Promise<PaymentCheckoutRef>;

  refund(input: RefundInput): Promise<PaymentRefundRef>;

  /** 验签并归一化 Webhook 事件。 */
  verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent>;
}

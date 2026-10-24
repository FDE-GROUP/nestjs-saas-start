/**
 * 支付通道标识联合（`stripe` / 支付宝 / 微信支付）。
 * @public
 */
export type PaymentProviderId = 'stripe' | 'alipay' | 'wechat_pay';

/**
 * 创建支付客户的入参。
 * @public
 */
export interface PaymentCustomerInput {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

/**
 * 下单/收款意图的入参。
 * @public
 */
export interface CreateCheckoutInput {
  /** 最小货币单位金额（如分为单位）。 */
  amount: number;
  /** 三位 ISO 货币码。 */
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
}

/**
 * 退款的入参。
 * @public
 */
export interface RefundInput {
  checkoutId: string;
  amount?: number;
  reason?: string;
}

/**
 * 跨通道归一化的客户引用。
 * @public
 */
export interface PaymentCustomerRef {
  id: string;
  providerId: PaymentProviderId;
  email: string;
  raw: unknown;
}

/**
 * 跨通道归一化的结账/收款意图引用。
 * @public
 */
export interface PaymentCheckoutRef {
  id: string;
  providerId: PaymentProviderId;
  status?: string;
  clientSecret?: string;
  raw: unknown;
}

/**
 * 跨通道归一化的退款引用。
 * @public
 */
export interface PaymentRefundRef {
  id: string;
  providerId: PaymentProviderId;
  status?: string;
  amount?: number;
  raw: unknown;
}

/**
 * 验签后归一化的 Webhook 事件。
 * @public
 */
export interface NormalizedPaymentEvent {
  providerId: PaymentProviderId;
  type: string;
  data: unknown;
  raw: unknown;
}

/**
 * 支付通道统一端口（global-cn-adaptation D1/P1）。
 *
 * @remarks
 * 与 `StorageProvider` 同构：领域只依赖本接口，具体通道（stripe/alipay/wechat_pay）
 * 由 `PaymentModule.register()` 依配置装配、`PaymentService` 依 `payment.provider` 选择。
 * 返回体为跨通道归一化引用 + `raw` 透传原生载荷，便于既有调用方渐进迁移。
 *
 * 分层对齐：原居 `providers/payment.interface.ts`，现下沉 `domain/ports`（零框架依赖）。
 * 签名属方案 §6.1 草案，随 P2/P3 通道接入在代码评审处定稿。
 * @public
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;

  /** 能力门：是否支持周期扣款/订阅（ stripe=true；境内代扣依签约能力，见 P3）。 */
  supportsRecurring(): boolean;

  /**
   * 创建（或复用）跨通道归一化的支付客户。
   * @param input - 客户入参（email/name/metadata）。
   * @returns 归一化客户引用。
   */
  createCustomer(input: PaymentCustomerInput): Promise<PaymentCustomerRef>;

  /** 下单/收款意图（stripe 映射 PaymentIntent，境内映射预授权/下单）。 */
  createCheckout(input: CreateCheckoutInput): Promise<PaymentCheckoutRef>;

  /**
   * 按 id 取回收款/结账引用。
   * @param id - 通道侧结账 id。
   * @returns 归一化结账引用。
   */
  retrieveCheckout(id: string): Promise<PaymentCheckoutRef>;

  /**
   * 对既有结账退款。
   * @param input - 退款入参（checkoutId/amount/reason）。
   * @returns 归一化退款引用。
   */
  refund(input: RefundInput): Promise<PaymentRefundRef>;

  /** 验签并归一化 Webhook 事件。 */
  verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent>;
}

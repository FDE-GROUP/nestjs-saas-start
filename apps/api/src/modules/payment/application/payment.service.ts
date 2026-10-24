import { ConfigService } from '@app/config/config.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { selectPaymentProvider } from '../domain/policies/provider-selection.policy';
import type {
  CreateCheckoutInput,
  NormalizedPaymentEvent,
  PaymentCheckoutRef,
  PaymentCustomerInput,
  PaymentCustomerRef,
  PaymentProvider,
  PaymentProviderId,
  PaymentRefundRef,
  RefundInput,
} from '../domain/ports/payment-provider.port';
import { Money } from '../domain/value-objects/money';

/**
 * 支付门面（application 编排层）：依 `payment.provider` 选择已注册的 `PaymentProvider`。
 *
 * @remarks
 * 采用**懒解析**——构造期不校验，避免未配任何通道时炸启动（NFR-2 未配即降级）；
 * 仅在实际调用支付操作时，若无可用通道才抛 `ServiceUnavailableException`。
 * 分层对齐后：通道选择/降级裁决与 `Money` 值对象下沉 `domain`，本层只编排并委托端口。
 * @public
 */
@Injectable()
export class PaymentService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject('PAYMENT_PROVIDERS')
    private readonly providers: Record<string, PaymentProvider>,
  ) {}

  /**
   * 当前可用通道概览（不抛错，供健康检查/诊断用）。
   * @returns 选中通道 id 与可用通道 id 列表。
   */
  describe(): { selected: PaymentProviderId; available: PaymentProviderId[] } {
    return {
      selected: this.config.getPaymentConfig().provider,
      available: Object.values(this.providers).map((p) => p.id),
    };
  }

  /**
   * 当前选中通道是否支持周期扣款/订阅。
   * @returns 支持为 `true`；无可用通道则抛 `ServiceUnavailableException`。
   */
  supportsRecurring(): boolean {
    return this.resolve().supportsRecurring();
  }

  /**
   * 创建支付客户。
   * @param input - 客户入参。
   * @returns 归一化客户引用。
   */
  createCustomer(input: PaymentCustomerInput): Promise<PaymentCustomerRef> {
    return this.resolve().createCustomer(input);
  }

  /**
   * 创建下单/收款意图（先经 `Money` 不变量兵底再委托端口）。
   * @param input - 结账入参（amount/currency 等）。
   * @returns 归一化结账引用。
   *
   * @throws {BadRequestException} 结算金额或币种非法时。
   */
  createCheckout(input: CreateCheckoutInput): Promise<PaymentCheckoutRef> {
    const money = Money.fromMinorUnits(input.amount, input.currency);
    if (!money.ok) {
      // 边界 zod `createCheckoutSchema` 已先行拦截，故 HTTP 面不可达；纯防御性兜底。
      throw new BadRequestException('Invalid checkout amount or currency.');
    }
    return this.resolve().createCheckout({ ...input, amount: money.money.amount });
  }

  /**
   * 按 id 取回结账引用。
   * @param id - 通道侧结账 id。
   * @returns 归一化结账引用。
   */
  retrieveCheckout(id: string): Promise<PaymentCheckoutRef> {
    return this.resolve().retrieveCheckout(id);
  }

  /**
   * 对既有结账退款。
   * @param input - 退款入参。
   * @returns 归一化退款引用。
   */
  refund(input: RefundInput): Promise<PaymentRefundRef> {
    return this.resolve().refund(input);
  }

  /**
   * 验签并归一化 Webhook 事件。
   * @param rawBody - 原始请求体。
   * @param signature - 通道签名头。
   * @returns 归一化支付事件。
   */
  verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent> {
    return this.resolve().verifyWebhook(rawBody, signature);
  }

  private resolve(): PaymentProvider {
    const wanted = this.config.getPaymentConfig().provider;
    const provider = selectPaymentProvider(this.providers, wanted);
    if (!provider) {
      throw new ServiceUnavailableException(
        `No payment provider configured (required: "${wanted}"). Enable stripe/alipay/wechat_pay.`,
        { errorCode: ERROR_CODES.BILLING_PROVIDER_NOT_CONFIGURED },
      );
    }
    return provider;
  }
}

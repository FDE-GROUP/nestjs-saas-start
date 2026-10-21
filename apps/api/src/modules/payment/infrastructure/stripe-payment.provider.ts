import { ConfigService } from '@app/config/config.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import type {
  CreateCheckoutInput,
  NormalizedPaymentEvent,
  PaymentCheckoutRef,
  PaymentCustomerInput,
  PaymentCustomerRef,
  PaymentProvider,
  PaymentRefundRef,
  RefundInput,
} from '../domain/ports/payment-provider.port';

/**
 * Stripe 通道适配器（收敛自旧 `StripeService`，global-cn-adaptation D1/P1）。
 * 实现统一 `PaymentProvider` 端口，把 Stripe 原生对象归一化并透传 `raw`。
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe' as const;

  private stripe?: Stripe;
  private readonly logger = new Logger(StripePaymentProvider.name);

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private get client(): Stripe {
    if (!this.stripe) {
      const stripeConfig = this.config.getStripeConfig();
      this.stripe = new Stripe(stripeConfig.secretKey, {
        apiVersion: stripeConfig.apiVersion as Stripe.LatestApiVersion,
      });
      this.logger.log('Stripe payment provider initialized');
    }
    return this.stripe;
  }

  supportsRecurring(): boolean {
    return true;
  }

  async createCustomer(input: PaymentCustomerInput): Promise<PaymentCustomerRef> {
    const customer = await this.client.customers.create({
      email: input.email,
      name: input.name,
      metadata: input.metadata,
    });
    return {
      id: customer.id,
      providerId: this.id,
      email: customer.email ?? input.email,
      raw: customer,
    };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<PaymentCheckoutRef> {
    const intent = await this.client.paymentIntents.create({
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      metadata: input.metadata,
    });
    return this.toCheckoutRef(intent);
  }

  async retrieveCheckout(id: string): Promise<PaymentCheckoutRef> {
    const intent = await this.client.paymentIntents.retrieve(id);
    return this.toCheckoutRef(intent);
  }

  async refund(input: RefundInput): Promise<PaymentRefundRef> {
    const refund = await this.client.refunds.create({
      payment_intent: input.checkoutId,
      amount: input.amount,
      reason: input.reason as Stripe.RefundCreateParams.Reason | undefined,
    });
    return {
      id: refund.id,
      providerId: this.id,
      status: refund.status ?? undefined,
      amount: refund.amount,
      raw: refund,
    };
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent> {
    const webhookSecret = this.config.getStripeConfig().webhookSecret;
    const event = await this.client.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    return {
      providerId: this.id,
      type: event.type,
      data: event.data,
      raw: event,
    };
  }

  private toCheckoutRef(intent: Stripe.PaymentIntent): PaymentCheckoutRef {
    return {
      id: intent.id,
      providerId: this.id,
      status: intent.status,
      clientSecret: intent.client_secret ?? undefined,
      raw: intent,
    };
  }
}

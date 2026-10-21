import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { ConfigService } from '../../config/config.service';
import { PaymentController } from './api/payment.controller';
import { PaymentService } from './application/payment.service';
import type { PaymentProvider } from './domain/ports/payment-provider.port';
import { StripePaymentProvider } from './infrastructure/stripe-payment.provider';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [PaymentController],
  exports: [PaymentService],
})
export class PaymentModule {
  /**
   * 依配置装配可用支付通道（与 `StorageModule.register()` 同构）。
   * 未配置的通道不注册；`PaymentService` 在调用时若无可用地报错（NFR-2 未配即降级）。
   */
  static register(): DynamicModule {
    return {
      module: PaymentModule,
      providers: [
        {
          provide: 'PAYMENT_PROVIDERS',
          useFactory: (configService: ConfigService) => {
            const providers: Record<string, PaymentProvider> = {};

            // Stripe：配置了 secret key 才注册（海外通道，境内可留空降级）
            const stripeConfig = configService.getStripeConfig();
            if (stripeConfig?.secretKey) {
              providers.stripe = new StripePaymentProvider(configService);
            }

            // P2/P3 扩展点：按 env 追加境内通道
            // if (alipayConfig?.enabled) providers.alipay = new AlipayPaymentProvider(configService);
            // if (wechatConfig?.enabled) providers.wechat_pay = new WechatPayPaymentProvider(configService);

            return providers;
          },
          inject: [ConfigService],
        },
        PaymentService,
      ],
    };
  }
}

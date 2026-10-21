import { PaymentService } from '@app/modules/payment/application/payment.service';
import type {
  CustomerProvisioner,
  ProvisionedCustomer,
} from '@core/saas-kit/modules/subscriptions/domain/ports/customer-provisioner.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `CustomerProvisioner` 的参考应用侧适配（§9.5.4①B/④ · P1c 支付端口）。
 *
 * 把订阅领域的「建立 tenant↔customer 映射」落到具体 `PaymentService.createCustomer`——
 * 依 `payment.provider` 选通道、无可用通道抛 503（懒解析·NFR-2 未配即降级）都留在应用侧，
 * core 只见标量 `ProvisionedCustomer`。`PaymentService` 经 @Global PaymentModule 全局可用。
 */
@Injectable()
export class PaymentCustomerProvisioner implements CustomerProvisioner {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  async provisionCustomer(email: string): Promise<ProvisionedCustomer> {
    const customer = await this.payment.createCustomer({ email });
    return { id: customer.id, providerId: customer.providerId };
  }
}

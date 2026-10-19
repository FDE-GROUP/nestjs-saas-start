import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TenantContextService } from '../../../../../tenancy/tenant-context.service';
import {
  CUSTOMER_PROVISIONER,
  type CustomerProvisioner,
} from '../../../domain/ports/customer-provisioner.port';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../../domain/repositories/subscription.repository';
import { QuotaService } from '../../../quota/quota.service';
import { resolvePlanDef } from '../../../quota/tenant-plans';
import { Quota } from '../../../quota/quota.vo';
import type { TenantSubscriptionView } from '../../read-models/subscription.read-model';
import { CreateSubscriptionCommand } from '../create-subscription.command';

/**
 * 开通/改档订阅（FR-7/FR-8）。流程：从 ALS 取活跃租户 → 解析档位限额 → **经 `CustomerProvisioner`
 * 端口建立 tenant↔customer 映射**（§9.5.4①B/④·具体 `PaymentService` 适配留应用侧、无可用通道时适配抛 503）
 * → 追加 active 订阅行（tenant 由仓储盖章·FR-5）→ 返回 `QuotaService.snapshot`。
 * 命令/处理器不命名 tenantId（port/adapter 从 ALS 注入·禁散点）。
 */
@CommandHandler(CreateSubscriptionCommand)
export class CreateSubscriptionCommandHandler
  implements ICommandHandler<CreateSubscriptionCommand>
{
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: SubscriptionRepository,
    @Inject(CUSTOMER_PROVISIONER) private readonly customers: CustomerProvisioner,
    @Inject(QuotaService) private readonly quota: QuotaService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  async execute(command: CreateSubscriptionCommand): Promise<TenantSubscriptionView> {
    const tenantId = this.tenant.requireTenantId();
    const planDef = resolvePlanDef(command.plan);
    // FR-8: materialize the provider-side customer (via the port) and map it onto the subscription row.
    const customer = await this.customers.provisionCustomer(command.customerEmail);
    await this.subscriptions.create({
      plan: command.plan,
      // P2：显式覆盖与档位默认两源统一经 Quota.of 摄入（非负整数不变量·违约 fail-loud）。
      seatsLimit: Quota.of(command.seatsLimit ?? planDef.seatsLimit.value).value,
      storageQuota: command.storageQuota ?? planDef.storageQuota ?? null,
      apiQuota: command.apiQuota ?? planDef.apiQuota ?? null,
      provider: customer.providerId,
      providerCustomerId: customer.id,
    });
    return this.quota.snapshot(tenantId);
  }
}

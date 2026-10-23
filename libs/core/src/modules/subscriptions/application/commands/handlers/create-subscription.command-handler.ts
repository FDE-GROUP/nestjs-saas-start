import { Inject, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { currentRequestId } from '../../../../../shared-kernel/context/request-context';
import { ES_TRUTH_SOURCE_SUBSCRIPTIONS } from '../../../../../shared-kernel/domain/es-truth-source.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../../../../shared-kernel/domain/event-publisher.port';
import { EVENT_STORE, type EventStore } from '../../../../../shared-kernel/domain/event-store.port';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../../../../shared-kernel/domain/unit-of-work.port';
import { TenantContextService } from '../../../../../tenancy/tenant-context.service';
import { SubscriptionCreatedEvent } from '../../../domain/events/subscription-created.event';
import {
  CUSTOMER_PROVISIONER,
  type CustomerProvisioner,
} from '../../../domain/ports/customer-provisioner.port';
import {
  SUBSCRIPTION_REPOSITORY,
  type SubscriptionRepository,
} from '../../../domain/repositories/subscription.repository';
import { resolvePlanDef } from '../../../quota/organization-plans';
import { QuotaService } from '../../../quota/quota.service';
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
    // ES R4c 真相源写切换（module-es-r4-second-context-subscriptions §3-R4c·高危#1 逐次亲签）：
    // 四参均 @Optional + 缺省——旋钮关（缺省）时既有四参 `new(...)` 调用点逐字节不变（新建仅 CRUD 插行·零事件）；
    // 开时 EVENT_STORE/发布器/UoW 由 @Global DatabaseModule 供·truthSource 由 SubscriptionsModule useFactory 注入。
    @Optional() @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events?: DomainEventPublisher,
    @Optional() @Inject(UNIT_OF_WORK) private readonly uow?: UnitOfWork,
    @Optional() @Inject(EVENT_STORE) private readonly eventStore?: EventStore,
    @Optional() @Inject(ES_TRUTH_SOURCE_SUBSCRIPTIONS) private readonly truthSource = false,
  ) {}

  async execute(command: CreateSubscriptionCommand): Promise<TenantSubscriptionView> {
    const tenantId = this.tenant.requireTenantId();
    const planDef = resolvePlanDef(command.plan);
    // FR-8: materialize the provider-side customer (via the port) and map it onto the subscription row.
    const customer = await this.customers.provisionCustomer(command.customerEmail);
    const draft = {
      plan: command.plan,
      // P2：显式覆盖与档位默认两源统一经 Quota.of 摄入（非负整数不变量·违约 fail-loud）。
      seatsLimit: Quota.of(command.seatsLimit ?? planDef.seatsLimit.value).value,
      storageQuota: command.storageQuota ?? planDef.storageQuota ?? null,
      apiQuota: command.apiQuota ?? planDef.apiQuota ?? null,
      provider: customer.providerId,
      providerCustomerId: customer.id,
    };

    // —— 原路径（缺省·旋钮关·逐字节不变：仅 CRUD 插行·零事件）——
    if (!this.truthSource) {
      await this.subscriptions.create(draft);
      return this.quota.snapshot(tenantId);
    }

    // —— ES R4c 真相源写路径（新建即流起点 `subscription.created`·投影 insert + append 同事务）——
    if (!this.eventStore) {
      throw new Error('ES_TRUTH_SOURCE_SUBSCRIPTIONS=true 需装配 EVENT_STORE（真相源写路径）');
    }
    if (!this.uow) {
      throw new Error(
        'ES_TRUTH_SOURCE_SUBSCRIPTIONS=true 需装配 UNIT_OF_WORK（新建 insert 与 append 同事务）',
      );
    }
    if (!this.events?.publishDurable) {
      throw new Error(
        'ES_TRUTH_SOURCE_SUBSCRIPTIONS=true 要求发布器实现 publishDurable（耐久 append + 乐观锁）',
      );
    }
    // 新行 aggregateId=行 id（裁ⓐ甲）·空流起点 expectedVersion=流长+1（新建=1）。
    // 捕获已收窄局部常量（属性收窄不入嵌套闭包·沿 R1c organization-status.service 无 `!` 写法）。
    const eventStore = this.eventStore;
    const publishDurable = this.events.publishDurable.bind(this.events);
    const record = await this.uow.run(async () => {
      const rec = await this.subscriptions.create(draft);
      const stream = await eventStore.load('subscription', rec.id);
      const event = new SubscriptionCreatedEvent({
        aggregateId: rec.id,
        correlationId: currentRequestId(),
        payload: { plan: rec.plan, status: rec.status },
      });
      await publishDurable([event], stream.length + 1);
      return rec;
    });
    return this.quota.snapshot(record.tenantId);
  }
}

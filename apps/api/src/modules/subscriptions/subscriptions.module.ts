import { ConfigService } from '@app/config/config.service';
import { CreateSubscriptionCommandHandler } from '@core/saas-kit/modules/subscriptions/application/commands/handlers/create-subscription.command-handler';
import { GetSubscriptionQueryHandler } from '@core/saas-kit/modules/subscriptions/application/queries/handlers/get-current-subscription.query-handler';
import { CUSTOMER_PROVISIONER } from '@core/saas-kit/modules/subscriptions/domain/ports/customer-provisioner.port';
import { SUBSCRIPTION_LIFECYCLE } from '@core/saas-kit/modules/subscriptions/domain/ports/subscription-lifecycle.port';
import { SUBSCRIPTION_REPOSITORY } from '@core/saas-kit/modules/subscriptions/domain/repositories/subscription.repository';
import { QuotaGuard } from '@core/saas-kit/modules/subscriptions/quota/quota.guard';
import { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import { QUOTA_STORE } from '@core/saas-kit/modules/subscriptions/quota/quota.store';
import { ES_TRUTH_SOURCE_SUBSCRIPTIONS } from '@core/saas-kit/shared-kernel/domain/es-truth-source.port';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SubscriptionsController } from './api/subscriptions.controller';
import { TenantStatusSubscriptionLinkHandler } from './infrastructure/dispatchers/tenant-status-subscription-link.handler';
import { MikroQuotaStore } from './infrastructure/mikro-quota.store';
import { MikroSubscriptionLifecycle } from './infrastructure/mikro-subscription.lifecycle';
import { PaymentCustomerProvisioner } from './infrastructure/payment-customer.provisioner';
import { MikroSubscriptionRepository } from './infrastructure/repositories/mikro-subscription.repository';

const CommandHandlers = [CreateSubscriptionCommandHandler];
const QueryHandlers = [GetSubscriptionQueryHandler];
// ES 首个真实业务消费者（module-es-first-real-consumer 治理档）：跨上下文只经领域事件入本侧
const EventHandlers = [TenantStatusSubscriptionLinkHandler];

/**
 * Tenant subscription slice (global-tenancy S7 · FR-7/FR-8/D5).
 *
 * Dependencies resolve without extra imports: `原数据库服务` (DatabaseModule @Global),
 * `TenantContextService` (TenancyModule @Global) and `PaymentService`
 * (PaymentModule now @Global). Dependency inversion: the domain owns the subscription
 * repository port; the ORM adapter stamps/scope the ALS tenant (FR-5 choke-point).
 *
 * 机制层提纯（未决项 4·module-tenancy-lifecycle-quota-relocation）：席位配额
 * （`QuotaService`/`QuotaGuard` + `QUOTA_STORE` Mikro 适配）由 TenancyModule 归位本上下文
 * （配额是订阅域策略·FR-7）；沿 Authorization/Platform 先例升 `@Global` 保持原可见性语义
 * （auth `seats-quota.hook` 与路由 opt-in 消费面零行为变更）。
 */
@Global()
@Module({
  imports: [CqrsModule],
  controllers: [SubscriptionsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    // ORM 修宪案 B · 切片 3c-ii-A：订阅仓储绑定改指 Mikro 适配（MikroORM 为唯一实现）。
    { provide: SUBSCRIPTION_REPOSITORY, useClass: MikroSubscriptionRepository },
    // 治理联动系统面端口（module-es-first-real-consumer·显式 tenantId·终态收敛）。
    { provide: SUBSCRIPTION_LIFECYCLE, useClass: MikroSubscriptionLifecycle },
    // ES R4c 真相源写切换（module-es-r4-second-context-subscriptions §3-R4c）：core/适配经 token 消费布尔，
    // 适配由本（参考）应用装配—读 ConfigService 单源（端口倒置·core 不感知 @app/config）。缺省 false·与 TENANTS 正交。
    {
      provide: ES_TRUTH_SOURCE_SUBSCRIPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.getEsTruthSourceConfig().subscriptions,
    },
    // §9.5.4①B/④ · P1c：订阅 domain/application 经端口消费客户开通，PaymentService 适配留应用侧。
    { provide: CUSTOMER_PROVISIONER, useClass: PaymentCustomerProvisioner },
    // 机制层提纯（未决项 4）：quota 服务/守卫与 store 适配自 TenancyModule 归位本上下文。
    // §9.5.4①B 端口倒置：core 服务经端口消费持久化，适配由本（参考）应用装配。
    QuotaService,
    QuotaGuard,
    { provide: QUOTA_STORE, useClass: MikroQuotaStore },
  ],
  exports: [
    // 随 @Global 导出：跨上下文消费面（auth seats-quota.hook·路由 @Quota opt-in）保形。
    QuotaService,
    QuotaGuard,
    QUOTA_STORE,
  ],
})
export class SubscriptionsModule {}

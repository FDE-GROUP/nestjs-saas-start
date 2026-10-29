import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { CreateSubscriptionCommand } from '@core/saas-kit/modules/subscriptions/application/commands/create-subscription.command';
import { GetSubscriptionQuery } from '@core/saas-kit/modules/subscriptions/application/queries/get-current-subscription.query';
import type { OrganizationSubscriptionView } from '@core/saas-kit/modules/subscriptions/application/read-models/subscription.read-model';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { Controller, Inject, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Impl } from '@orpc/nest';
import {
  subscriptionsCreateContract,
  subscriptionsCreateMeta,
  subscriptionsGetCurrentContract,
  subscriptionsGetCurrentMeta,
} from '@saas/api-contract/index';
import { createSubscriptionSchema, subscriptionViewSchema } from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';

/**
 * 组织订阅切片的 HTTP 控制器（多租户 S7 · FR-7/FR-8/D5）。
 *
 * @remarks
 * Tenant subscription slice (global-tenancy S7 · FR-7/FR-8/D5).
 *
 * Per-route guards only — the global APP_GUARD stays a signed decision (高危#4):
 * - `GET /subscriptions/current`: `TenantIsolationGuard` (fail-closed · any authenticated
 *   member of the active organization reads their own plan/usage/mapping).
 * - `POST /subscriptions`: additionally `AuthorizationGuard` + `organization:update`
 *   (owner/admin change the plan). The route never names a tenant id — the repository
 *   stamps the ALS tenant (FR-5 single choke-point).
 *
 * Provision actually calls `PaymentService.createCustomer` to establish the tenant ↔
 * customer mapping (FR-8). Quota超限拒绝 (FR-7) is enforced via `QuotaService`/`QuotaGuard`;
 * the production member-add attach point (Better Auth route) is deferred to a later slice.
 * @public
 */
// 换轨 WP-C：两路由转 per-method `@Impl`（非 router 扇出）——方法级 `@UseGuards` + `@Can` 原生保留
// （租户墙/授权墙不弱化）；旧 `@SerializeOptions` 白名单下沉到 procedure 级 `.output`（zod 单源不变）。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export { subscriptionsCreateContract, subscriptionsGetCurrentContract };

@Controller('')
export class SubscriptionsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 读取当前组织的有效订阅快照（套餐/席位配额/用量/客户映射）。
   * @returns 当前组织的订阅视图。
   */
  @UseGuards(TenantIsolationGuard)
  @Impl(subscriptionsGetCurrentContract)
  getCurrent() {
    return os
      .output(subscriptionViewSchema)
      .meta(subscriptionsGetCurrentMeta)
      .handler(() =>
        this.queryBus.execute<GetSubscriptionQuery, OrganizationSubscriptionView>(
          new GetSubscriptionQuery(),
        ),
      );
  }

  /**
   * 开通/升级组织订阅（创建支付供应商客户并落席位/存储/API 配额）。
   * @returns 更新后的订阅快照视图。
   */
  @UseGuards(TenantIsolationGuard, AuthorizationGuard)
  @Can('update', 'Organization')
  @Impl(subscriptionsCreateContract)
  create() {
    return os
      .input(createSubscriptionSchema)
      .output(subscriptionViewSchema)
      .meta(subscriptionsCreateMeta)
      .handler(({ input }) =>
        this.commandBus.execute<CreateSubscriptionCommand, OrganizationSubscriptionView>(
          new CreateSubscriptionCommand(
            input.plan,
            input.customerEmail,
            input.seatsLimit,
            input.storageQuota,
            input.apiQuota,
          ),
        ),
      );
  }
}

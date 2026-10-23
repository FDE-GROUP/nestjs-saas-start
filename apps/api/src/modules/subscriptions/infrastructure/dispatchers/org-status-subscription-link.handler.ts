import { OrganizationStatusTransitionedEvent } from '@core/saas-kit/modules/organizations/lifecycle/events/organization-status-transitioned.event';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import {
  SUBSCRIPTION_LIFECYCLE,
  type SubscriptionLifecycle,
} from '@core/saas-kit/modules/subscriptions/domain/ports/subscription-lifecycle.port';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/quota/organization-plans';
import { Inject, Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';

/**
 * **ES 首个真实业务消费者**（module-es-first-real-consumer 治理档 · 裁点乙「suspend ⇒ 订阅关闭」
 * 商业规则已人裁成立）：tenancy 上下文治理动作 → subscriptions 上下文订阅行联动，跨上下文只经
 * 领域事件（本上下文零特判、发布点零改动）。
 *
 * 投递通道无关：`inproc` 直投与 `outbox` relay 投递（经 `EVENT_TYPE_REGISTRY` 以**同一事件类**重建）
 * 落到同一 handler——类同一性由 registry 契约测试双向锁背书。
 *
 * 幂等（at-least-once 硬要求）：映射为终态收敛调用，重投/滞后由 `SubscriptionLifecycle`
 * 端口契约收敛为 no-op；本 handler 绝不按事件计数变更。
 */
@EventsHandler(OrganizationStatusTransitionedEvent)
export class OrganizationStatusSubscriptionLinkHandler
  implements IEventHandler<OrganizationStatusTransitionedEvent>
{
  private readonly logger = new Logger(OrganizationStatusSubscriptionLinkHandler.name);

  constructor(@Inject(SUBSCRIPTION_LIFECYCLE) private readonly lifecycle: SubscriptionLifecycle) {}

  async handle(event: OrganizationStatusTransitionedEvent): Promise<void> {
    const organizationId = event.aggregateId;
    const to = event.payload.to;
    if (to === ORGANIZATION_STATUS.SUSPENDED) {
      const changed = await this.lifecycle.convergeStatus(
        organizationId,
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.SUSPENDED,
      );
      this.logger.log(
        `tenant.suspended → 订阅联动: tenant=${organizationId} eventId=${event.eventId} changed=${changed}`,
      );
      return;
    }
    if (to === ORGANIZATION_STATUS.ACTIVE) {
      // resume/approve：仅回收**本次治理挂起**的可恢复行；不回溯历史 cancelled/expired（1:N 历史纪律）
      const changed = await this.lifecycle.convergeStatus(
        organizationId,
        SUBSCRIPTION_STATUS.SUSPENDED,
        SUBSCRIPTION_STATUS.ACTIVE,
      );
      this.logger.log(
        `tenant.active → 订阅联动: tenant=${organizationId} eventId=${event.eventId} changed=${changed}`,
      );
      return;
    }
    // to=deleted：organization_subscription FK cascade 已随租户硬删，零动作；to=pending_approval：
    // 订阅不应先于 approve 存在（S7 时序），no-op 留痕可观测。
    this.logger.debug(
      `tenant.status.transitioned → 订阅无需联动: tenant=${organizationId} to=${to} eventId=${event.eventId}`,
    );
  }
}

import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { SubscriptionStatusTransitionedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-status-transitioned.event';
import type { SubscriptionLifecycle } from '@core/saas-kit/modules/subscriptions/domain/ports/subscription-lifecycle.port';
import { canTransition } from '@core/saas-kit/modules/subscriptions/domain/subscription-lifecycle';
import {
  applySubscriptionEvent,
  replaySubscriptionLifecycle,
} from '@core/saas-kit/modules/subscriptions/domain/subscription-lifecycle-fold';
import type { SubscriptionStatus } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
import { ES_TRUTH_SOURCE_SUBSCRIPTIONS } from '@core/saas-kit/shared-kernel/domain/es-truth-source.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { EVENT_STORE, type EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable, Optional } from '@nestjs/common';

/**
 * `SUBSCRIPTION_LIFECYCLE` 的 MikroORM 适配（系统面 · module-es-first-real-consumer 治理档）。
 *
 * 终态收敛式的物理兑现：按显式 `tenantId`（治理事件 `aggregateId`·可信单源）找最新一条 `from` 态行
 * （`periodStart` 倒序·`createdAt` 倒序决定性——新行 id 虽已 UUIDv7 可时序，但存量行混有 v4 时代
 * id，表内 id 序暂不可依赖，故排序仍走时间列），存在才置 `to` 态并显式盖 `updatedAt`；无 `from` 行
 * 零写返回 `false`——重投/滞后事件天然 no-op，at-least-once 的幂等硬要求在此闭环。
 *
 * 不走 `requireTenantId()`：本面属平台治理消费者（无目标租户请求 ALS），隔离语义由「tenantId 只
 * 源自治理卡点事件行」保证；用户面 port 的 ALS 卡点纪律（FR-5）不受本类影响。
 *
 * ES R4c 真相源写切换（module-es-r4-second-context-subscriptions §3-R4c·高危#1 逐次亲签）：
 * `ES_TRUTH_SOURCE_SUBSCRIPTIONS` 旋钮开（缺省关·既有单参 `new(mikro)` 逐字节不变），`convergeStatus`
 * 走「load→fold 前置态裁决（canTransition）→publishDurable(expectedVersion 乐观锁·同事务 append)→
 * 投影 nativeUpdate(fold 结果)」——订阅流为真相·`tenant_subscription.status` 降为投影。与 `EVENT_PUBLISH_MODE`
 * 正交（后者决定派发通道）。四端口均 @Optional，装配见 `SubscriptionsModule` + @Global DatabaseModule。
 */
@Injectable()
export class MikroSubscriptionLifecycle implements SubscriptionLifecycle {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Optional() @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events?: DomainEventPublisher,
    @Optional() @Inject(UNIT_OF_WORK) private readonly uow?: UnitOfWork,
    @Optional() @Inject(EVENT_STORE) private readonly eventStore?: EventStore,
    @Optional() @Inject(ES_TRUTH_SOURCE_SUBSCRIPTIONS) private readonly truthSource = false,
  ) {}

  /** 选最新一条 `from` 态订阅行（终态收敛的读入口·OFF/ON 两路共用）。 */
  private async findFromRow(
    em: Awaited<ReturnType<MikroOrmService['fork']>>,
    tenantId: string,
    from: SubscriptionStatus,
  ) {
    const rows = await em.find(
      TenantSubscription,
      { tenantId, status: from } as never,
      { orderBy: { periodStart: QueryOrder.DESC, createdAt: QueryOrder.DESC }, limit: 1 } as never,
    );
    return rows[0];
  }

  async convergeStatus(
    tenantId: string,
    from: SubscriptionStatus,
    to: SubscriptionStatus,
  ): Promise<boolean> {
    // —— 原路径（缺省·旋钮关·逐字节不变）——
    if (!this.truthSource) {
      const em = await this.mikro.fork();
      const row = await this.findFromRow(em, tenantId, from);
      if (!row) {
        return false;
      }
      await em.nativeUpdate(
        TenantSubscription,
        { id: row.id } as never,
        { status: to, updatedAt: new Date() } as never,
      );
      return true;
    }

    // —— ES R4c 真相源写路径（旋钮开·module-es-r4-second-context-subscriptions §3-R4c）——
    if (!this.eventStore) {
      throw new Error('ES_TRUTH_SOURCE_SUBSCRIPTIONS=true 需装配 EVENT_STORE（真相源写路径）');
    }
    if (!this.events?.publishDurable) {
      throw new Error(
        'ES_TRUTH_SOURCE_SUBSCRIPTIONS=true 要求发布器实现 publishDurable（耐久 append + 乐观锁）',
      );
    }
    // append（事件流）与投影 nativeUpdate 同事务原子（outbox 下·UoW 缺省关时透传·同 R1c）。
    // 捕获已收窄局部常量（属性收窄不入嵌套闭包·沿 R1c organization-status.service 无 `!` 写法）。
    const eventStore = this.eventStore;
    const publishDurable = this.events.publishDurable.bind(this.events);
    const uow = this.uow;
    const run = async () => {
      const em = await this.mikro.fork();
      const row = await this.findFromRow(em, tenantId, from);
      if (!row) {
        return false;
      }
      // 裁决输入 = 流重放态（非表行）；fold 前置态与表行 `from` 一致性由 bootstrap + 「投影携 fold 结果」不变量保证。
      const stream = await eventStore.load('subscription', row.id);
      const replay = replaySubscriptionLifecycle(stream);
      const previous = replay?.status;
      if (!canTransition(previous, to)) {
        // 治理联动期望迁移与实际 fold 前态不相容 → 不发事件·不写（保持终态收敛幂等·fail-safe）。
        return false;
      }
      const event = new SubscriptionStatusTransitionedEvent({
        aggregateId: row.id,
        correlationId: currentRequestId(),
        payload: { from: previous ?? null, to, actorId: 'tenant-link' },
      });
      // 乐观锁：流 contiguous（bootstrap/append 均 max+1 续位）→ expectedVersion=流长+1。
      await publishDurable([event], stream.length + 1);
      // 投影：fold 结果回写订阅行 status（严格等于重放态·非手推 to）。
      const next = applySubscriptionEvent(replay, event);
      await em.nativeUpdate(
        TenantSubscription,
        { id: row.id } as never,
        { status: next.status, updatedAt: new Date() } as never,
      );
      return true;
    };
    return uow ? uow.run(run) : run();
  }

  /**
   * 单流重建投影（ES R4c·诊断面）：`load → fold → 回写投影行 status`。空流=「无状态记录」→
   * 不写、返回 undefined（避免凭空造态）。
   */
  async rebuildProjection(subscriptionId: string): Promise<SubscriptionStatus | undefined> {
    if (!this.eventStore) {
      throw new Error('rebuildProjection 需装配 EVENT_STORE');
    }
    const replay = replaySubscriptionLifecycle(
      await this.eventStore.load('subscription', subscriptionId),
    );
    if (!replay) return undefined;
    const em = await this.mikro.fork();
    await em.nativeUpdate(
      TenantSubscription,
      { id: subscriptionId } as never,
      { status: replay.status, updatedAt: new Date() } as never,
    );
    return replay.status;
  }
}

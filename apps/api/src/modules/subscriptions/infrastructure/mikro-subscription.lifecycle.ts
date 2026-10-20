import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import type { SubscriptionLifecycle } from '@core/saas-kit/modules/subscriptions/domain/ports/subscription-lifecycle.port';
import type { SubscriptionStatus } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `SUBSCRIPTION_LIFECYCLE` 的 MikroORM 适配（系统面 · module-es-first-real-consumer 治理档）。
 *
 * 终态收敛式的物理兑现：按显式 `tenantId`（治理事件 `aggregateId`·可信单源）找最新一条 `from` 态行
 * （`periodStart` 倒序·`createdAt` 倒序决定性——新行 id 虽已 UUIDv7 可时序，但存量行混有 v4 时代
 * id，表内 id 序暂不可依赖，故排序仍走时间列），存在才 `nativeUpdate` 置 `to` 态并显式盖 `updatedAt`
 * （与 `MikroSubscriptionRepository` 同律·无 DB 默认）；无 `from` 行零写返回 `false`——重投/滞后
 * 事件天然 no-op，at-least-once 的幂等硬要求在此闭环。
 *
 * 不走 `requireTenantId()`：本面属平台治理消费者（无目标租户请求 ALS），隔离语义由「tenantId 只
 * 源自治理卡点事件行」保证；用户面 port 的 ALS 卡点纪律（FR-5）不受本类影响。
 */
@Injectable()
export class MikroSubscriptionLifecycle implements SubscriptionLifecycle {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async convergeStatus(
    tenantId: string,
    from: SubscriptionStatus,
    to: SubscriptionStatus,
  ): Promise<boolean> {
    const em = await this.mikro.fork();
    const rows = await em.find(
      TenantSubscription,
      { tenantId, status: from } as never,
      { orderBy: { periodStart: QueryOrder.DESC, createdAt: QueryOrder.DESC }, limit: 1 } as never,
    );
    const row = rows[0];
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
}

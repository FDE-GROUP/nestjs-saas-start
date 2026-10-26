import { SubscriptionBootstrappedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-bootstrapped.event';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';
import { type EntityManager, QueryOrder } from '@mikro-orm/core';
import { subscriptionBootstrappedPayloadSchema } from '@saas/contracts/index';
import { TenantSubscription } from '../../modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { Event } from './entities/event.entity';

/**
 * ES R4b —— subscription 存量治理行「成流」bootstrap 核心（module-es-r4-second-context-subscriptions §3-R4b · 裁ⓐ甲）。
 *
 * 对 `tenant_subscription` 表每行产 `subscription.bootstrapped` v1 落该聚合流，使「回放即真相」读侧自
 * 存量数据起可成立。**镜像 R1b `bootstrapTenantStreams` 全部 seam**，三条案文定死的律：
 *  - **裁ⓐ甲 per-行一流**：`aggregateType='subscription'`·`aggregateId=订阅行 id`（一租户可多行分期→每行独立流）。
 *  - **version 续位**：从流现有 max+1 续（既有事件之后）——不重排历史；fold 侧「最后快照重启」语义对接。
 *  - **幂等律**：流内已含 bootstrapped 即跳过（可安全重跑）。
 *  - **zod 律**：新事件 payload 一律过 `@saas/contracts` schema——append 前 `subscriptionBootstrappedPayloadSchema.parse`
 *    （payload=`{status, plan?, actorId?}`，`actorId` 恒 `'bootstrap'` 审计留痕；无 subject PII）。
 *
 * 落位 `database/eventing/`（ES 跨切面·非上下文目录）；写形逐字节对齐 `MikroEventStore.append` 的 insert 面。
 * **不经** `MikroEventStore`/`MikroOrmService`（其链上 `@app/config` 别名对 tsx 不解析·R-η），由入口
 * （`scripts/es-bootstrap-subscriptions.ts` / gated e2e）注入 em。高危#1（数据 backfill·写库）：dev 经人亲签；**prod apply 另签**。
 */
export interface BootstrapSubscriptionStreamsOptions {
  /** 测试收窄：仅处理给定聚合 id（gated e2e 对拍自身夹具用）；缺省=全表（生产脚本语义）。 */
  readonly onlyIds?: readonly string[];
}

export interface BootstrapSubscriptionStreamsResult {
  /** 命中处理的订阅行数（含跳过）。 */
  readonly total: number;
  readonly created: number;
  readonly skipped: number;
}

/** subscription 流事件过滤单源（逃逸收敛一处·同 MikroEventStore.byStream 纪律）。 */
function streamFilter(aggregateId: string, eventType?: string) {
  return {
    aggregateType: 'subscription',
    aggregateId,
    ...(eventType === undefined ? {} : { eventType }),
  } as never;
}

export async function bootstrapSubscriptionStreams(
  em: EntityManager,
  options: BootstrapSubscriptionStreamsOptions = {},
): Promise<BootstrapSubscriptionStreamsResult> {
  const subscriptions = await em.find(
    TenantSubscription,
    options.onlyIds ? { id: { $in: [...options.onlyIds] } } : {},
    { orderBy: { id: QueryOrder.ASC } },
  );

  let created = 0;
  let skipped = 0;
  for (const row of subscriptions) {
    // 幂等判重：流内已含 bootstrapped → 跳过（可安全重跑）。
    const dup = await em.find(Event, streamFilter(row.id, DOMAIN_EVENTS.subscriptionBootstrapped), {
      limit: 1,
    });
    if (dup.length > 0) {
      skipped += 1;
      continue;
    }

    // version 续位：既有事件之后（max+1），不重排历史。
    const latest = await em.find(Event, streamFilter(row.id), {
      orderBy: { version: QueryOrder.DESC },
      limit: 1,
    });
    const version = (latest[0]?.version ?? 0) + 1;

    // zod 律：payload 先过契约 schema 再入流。
    const payload = subscriptionBootstrappedPayloadSchema.parse({
      status: row.status,
      plan: row.plan,
      actorId: 'bootstrap',
    });
    const event = new SubscriptionBootstrappedEvent({ aggregateId: row.id, payload });

    await em.insert(Event, {
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateType: SubscriptionBootstrappedEvent.AGGREGATE_TYPE,
      version,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload,
      metadata: { correlationId: null, causationId: null },
      occurredAt: event.occurredAt,
    } as never);
    created += 1;
  }

  return { total: subscriptions.length, created, skipped };
}

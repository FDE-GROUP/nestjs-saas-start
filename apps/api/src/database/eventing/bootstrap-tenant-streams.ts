import { TenantBootstrappedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-bootstrapped.event';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';
import { type EntityManager, QueryOrder } from '@mikro-orm/core';
import { tenantBootstrappedPayloadSchema } from '@saas/contracts/index';
import { Tenant } from '../../modules/tenants/infrastructure/entities/tenant.entity';
import { Event } from './entities/event.entity';

/**
 * ES R1b —— tenant 存量户籍行「成流」bootstrap 核心（module-es-r1-replay-core §3-R1b · 裁②甲）。
 *
 * 对 `tenant` 户籍表每行产 `tenant.bootstrapped` v1 落该聚合流，使「回放即真相」读侧自
 * 存量数据起可成立。三条案文定死的律：
 *  - **version 续位**：从流现有 max+1 续（既有治理事件之后）——不重排历史；fold 侧
 *    「最后快照重启」语义（§3-R1b·快照覆盖此前一切）与此对接，见 `tenant-lifecycle-fold`。
 *  - **幂等律**：流内已含 bootstrapped 即跳过（可安全重跑）。
 *  - **zod 律（R1 起）**：新事件 payload 一律过 `@saas/contracts` schema——本件在 append
 *    前 `tenantBootstrappedPayloadSchema.parse`（R1a 实核订正：payload=`{status, actorId?}`，
 *    户籍表无 name/slug；`actorId` 恒 `'bootstrap'` 审计留痕）。
 *
 * 落位 `database/eventing/`（ES 跨切面·非上下文目录）；写形逐字节对齐 `MikroEventStore.append`
 * 的 insert 面（信封→列）。**不经** `MikroEventStore`/`MikroOrmService`（其链上 `@app/config`
 * 别名对 tsx 不解析·R-η），由入口（`scripts/es-bootstrap-tenants.ts` / gated e2e）注入 em。
 * 高危#1（数据 backfill）：dev 经人亲签 2026-10-21；**prod apply 另签**。
 */
export interface BootstrapTenantStreamsOptions {
  /** 测试收窄：仅处理给定聚合 id（gated e2e 对拍自身夹具用）；缺省=全表（生产脚本语义）。 */
  readonly onlyIds?: readonly string[];
}

export interface BootstrapTenantStreamsResult {
  /** 命中处理的户籍行数（含跳过）。 */
  readonly total: number;
  readonly created: number;
  readonly skipped: number;
}

/** tenant 流事件过滤单源（逃逸收敛一处·同 MikroEventStore.byStream 纪律）。 */
function streamFilter(aggregateId: string, eventType?: string) {
  return {
    aggregateType: 'tenant',
    aggregateId,
    ...(eventType === undefined ? {} : { eventType }),
  } as never;
}

export async function bootstrapTenantStreams(
  em: EntityManager,
  options: BootstrapTenantStreamsOptions = {},
): Promise<BootstrapTenantStreamsResult> {
  const tenants = await em.find(
    Tenant,
    options.onlyIds ? { id: { $in: [...options.onlyIds] } } : {},
    { orderBy: { id: QueryOrder.ASC } },
  );

  let created = 0;
  let skipped = 0;
  for (const row of tenants) {
    // 幂等判重：流内已含 bootstrapped → 跳过（可安全重跑）。
    const dup = await em.find(Event, streamFilter(row.id, DOMAIN_EVENTS.tenantBootstrapped), {
      limit: 1,
    });
    if (dup.length > 0) {
      skipped += 1;
      continue;
    }

    // version 续位：既有治理事件之后（max+1），不重排历史。
    const latest = await em.find(Event, streamFilter(row.id), {
      orderBy: { version: QueryOrder.DESC },
      limit: 1,
    });
    const version = (latest[0]?.version ?? 0) + 1;

    // zod 律：payload 先过契约 schema 再入流。
    const payload = tenantBootstrappedPayloadSchema.parse({
      status: row.status,
      actorId: 'bootstrap',
    });
    const event = new TenantBootstrappedEvent({ aggregateId: row.id, payload });

    await em.insert(Event, {
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateType: TenantBootstrappedEvent.AGGREGATE_TYPE,
      version,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload,
      metadata: { correlationId: null, causationId: null },
      occurredAt: event.occurredAt,
    } as never);
    created += 1;
  }

  return { total: tenants.length, created, skipped };
}

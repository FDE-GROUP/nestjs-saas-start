import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { MikroOrmService } from '../mikro/mikro-orm.service';
import { Event } from './entities/event.entity';

/**
 * ORM 修宪案 B · 切片 3c-ii-C —— `EventStore` 端口的 **MikroORM 适配**（`EVENT_STORE` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 影子追加语义逐字保真（承 `原事件存储适配` / module-users-es-append §2.2）：CRUD 仍是唯一真相源，
 * 本适配只把 DomainEvent 信封耐久落 `event` 表——
 *  - 空批 noop（不触库）；
 *  - `version`（聚合内序号）按 `(aggregateType, aggregateId)` 流 max+1 递增取得（`eventVersion` 是
 *    schema 版本·非序号，见 plan §6 审计改动）；
 *  - 并发窗口与重复 `eventId` 由 DB 唯一键 `(aggregateType, aggregateId, version)` / `event_event_id_key`
 *    兜底 **fail-loud**（`em.insert` 直发 INSERT，违约束即如实抛、不静默吞、不重试覆盖）；
 *  - `deleteByAggregate` 为 PIPL 级联补删面（第二切片 §3.2）：`nativeDelete` 纯 SQL DELETE 返删除条数，
 *    不受 `EVENT_PUBLISH_MODE` 开关控制、失败 fail-loud。
 *
 * 落位 `database/`（与 `原事件存储适配` 同层·ES 跨切面端口实现·非 modules/tenancy 上下文）→
 * 表所有权纪律守卫（只扫 modules/tenancy）正交·`event` 写面不受跨上下文判定约束。
 * 每次读写经 `MikroOrmService.fork()` 取独立 em（禁全局 `orm.em`·与其余 Mikro 适配同纪律）；`insert`/
 * `nativeDelete` 不经 Identity Map（append-only + 无状态补删语义最贴·与 3c-ii-A store 同律）。
 */
@Injectable()
export class MikroEventStore implements EventStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async append(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const em = await this.mikro.fork();
    for (const domainEvent of events) {
      const version = await this.nextVersion(
        em,
        domainEvent.aggregateType,
        domainEvent.aggregateId,
      );
      await em.insert(Event, {
        eventId: domainEvent.eventId,
        aggregateId: domainEvent.aggregateId,
        aggregateType: domainEvent.aggregateType,
        version,
        eventType: domainEvent.eventType,
        eventVersion: domainEvent.eventVersion,
        payload: domainEvent.payload,
        metadata: {
          correlationId: domainEvent.correlationId ?? null,
          causationId: domainEvent.causationId ?? null,
        },
        occurredAt: domainEvent.occurredAt,
      } as never);
    }
  }

  private async nextVersion(
    em: Awaited<ReturnType<MikroOrmService['fork']>>,
    aggregateType: string,
    aggregateId: string,
  ): Promise<number> {
    const rows = await em.find(Event, { aggregateType, aggregateId } as never, {
      orderBy: { version: QueryOrder.DESC },
      limit: 1,
      fields: ['version'],
    });
    return ((rows[0] as unknown as { version?: number } | undefined)?.version ?? 0) + 1;
  }

  /**
   * PIPL 级联补删（module-tenancy-es-lifecycle-events §3.2）：显式清指定聚合的全部事件行，
   * 返回删除条数（`nativeDelete` 返 affected）。不受 `EVENT_PUBLISH_MODE` 开关控制（调用方直注
   * `EVENT_STORE`）；失败 fail-loud。
   */
  async deleteByAggregate(aggregateType: string, aggregateId: string): Promise<number> {
    const em = await this.mikro.fork();
    return em.nativeDelete(Event, { aggregateType, aggregateId } as never);
  }
}

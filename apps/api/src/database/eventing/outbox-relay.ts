import { ConfigService } from '@app/config/config.service';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { type EntityManager, LockMode, QueryOrder } from '@mikro-orm/core';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { MikroOrmService } from '../mikro/mikro-orm.service';
import { Event } from './entities/event.entity';
import { EVENT_TYPE_REGISTRY } from './event-type-registry';

/**
 * Outbox relay：event 表 → 进程内 EventBus 的投递器（ES Phase B 后半 · module-es-outbox-transactional 切片 C）。
 *
 * #1 甲档收口（module-p0-async-boundary-correctness 切片 C）：**claim（事务内置 dispatchedAt）→ 提交 →
 * 提交后尽力投递**。旧实现在事务内 `publishAll` 后才置位，事务回滚则事件已下发至进程内总线不可撤销→幻影事件；
 * 且真 `@nestjs/cqrs` `publishAll` 同步入队、handler 在微任务执行、异常不回抛，旧 `try/catch` 捕不到消费
 * 失败却据此 `attemptCount+1`——锁的是一个真实总线不产生的失败形态。本档据实重排事务边界并诚实化投递保证。
 *
 * 仅 `EVENT_PUBLISH_MODE=outbox` 时启动（缺省 inproc 零 timer 零触库——DB-free 装配不变量不动）。每拍：
 *  1. **事务内**以 `FOR UPDATE SKIP LOCKED` 取一批未投递行（id 升序=流内保序·多实例并发安全），逐行：
 *     - 拒收比自己新的信封（`eventVersion > SUPPORTED`）→ 行级 `parkRow`（attemptCount 顶到上限停重试·relay 不停摆）；
 *     - 未知 `eventType`（注册表外）→ 同 parkRow（防毒行运行期才炸·注册表契约测本已双向锁）；
 *     - 崩溃重投的 `eventId` 命中去重窗 → 只标记不再下发（有界 LRU·重启后窗清空时消费者仍需自身幂等）；
 *     - 否则重建类实例 + **事务内置 `dispatchedAt`（claim）**·收入待投批次（不在此下发）。
 *  2. **事务提交后**才对已 claim 批次 `publishAll` 投进程内总线。
 *
 * **保证口径（诚实）**：不提交则不投递→消灭幻影事件（回滚下拍重取）；claim 耐久（提交后崩溃=已 claim
 * 未投·下拍不重取）。进程内总线**无 ack**：handler 异常被本循环不可见·提交后崩溃即丢，故为
 * `at-least-once-to-claim + best-effort in-process`，**非端到端 at-least-once**——消费者需自身幂等（roadmap 硬要求）。
 * `parkRow` 的表内 `lastError`/`attemptCount=MAX` 即 DLQ 态（仅对可确定识别的毒信封·非投递失败）。
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  static readonly SUPPORTED_EVENT_VERSION = 1;
  static readonly BATCH_SIZE = 50;
  static readonly MAX_ATTEMPTS = 5;
  private static readonly SEEN_CAP = 10_000;

  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  /** 已投递 eventId 去重窗（Map 插入序 = FIFO 淘汰序）。 */
  private readonly seenEventIds = new Map<string, true>();

  constructor(
    // S9 教训：构造函数注入类值导入 + 显式 @Inject，防 swc design:paramtypes 退化
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(EventBus) private readonly eventBus: EventBus,
  ) {}

  onApplicationBootstrap(): void {
    const { mode, pollMs } = this.config.getEventPublishConfig();
    if (mode !== 'outbox') {
      return;
    }
    this.timer = setInterval(() => {
      this.tickOnce().catch((error: unknown) =>
        this.logger.error(`outbox relay tick failed: ${String(error)}`),
      );
    }, pollMs);
    this.logger.log(`outbox relay started (poll ${pollMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * 投递一轮，返回处理行数。同实例防重入（上一拍未完 → 立即返回 0，timer 拍不叠加）。
   * 公开入口供单测/真库 e2e 直调（确定性驱动，不依赖墙钟）。
   */
  async tickOnce(): Promise<number> {
    if (this.ticking) {
      return 0;
    }
    this.ticking = true;
    try {
      const em = await this.mikro.fork();
      // ① 事务内：claim（取批 + 置 dispatchedAt）+ 收集待投实例；返回待投批次与处理行数。
      const { batch, processed } = await em.transactional(async (tx) => {
        const rows = await tx.find(
          Event,
          {
            dispatchedAt: null,
            attemptCount: { $lt: OutboxRelay.MAX_ATTEMPTS },
          } as never,
          {
            orderBy: { id: QueryOrder.ASC },
            limit: OutboxRelay.BATCH_SIZE,
            forUpdate: { lockMode: LockMode.PESSIMISTIC_WRITE, skipLocked: true },
          } as never,
        );
        const batch: DomainEvent[] = [];
        let processed = 0;
        for (const row of rows) {
          const instance = await this.claimRow(tx, row);
          if (instance) {
            batch.push(instance);
          }
          processed++;
        }
        return { batch, processed };
      });
      // ② 事务提交后：对已 claim 批次尽力投递（甲档·消灭幻影事件）。进程内总线无 ack——handler 异常在
      // 微任务执行、不回传本循环；即便 publishAll 抛错也仅记日志、不回滚已提交的 claim（行已 dispatchedAt）。
      // 故不据投递结果动 attemptCount（旧版据此重试=锁真实总线不产生的失败形态·失真已去）。
      for (const instance of batch) {
        try {
          this.eventBus.publishAll([instance]);
        } catch (error: unknown) {
          this.logger.error(
            `outbox post-commit publish threw for a claimed row（best-effort·claim 不回滚）: ${String(error)}`,
          );
        }
      }
      return processed;
    } finally {
      this.ticking = false;
    }
  }

  private async claimRow(tx: EntityManager, row: Event): Promise<DomainEvent | null> {
    if (row.eventVersion > OutboxRelay.SUPPORTED_EVENT_VERSION) {
      await this.parkRow(tx, row, `unsupported eventVersion ${row.eventVersion}`);
      this.logger.warn(
        `outbox parked row id=${row.id}: unsupported eventVersion ${row.eventVersion}（行级拒收·裁点丁）`,
      );
      return null;
    }
    const EventClass = EVENT_TYPE_REGISTRY.get(row.eventType);
    if (!EventClass) {
      await this.parkRow(tx, row, `unknown eventType ${row.eventType}`);
      this.logger.warn(`outbox parked row id=${row.id}: unknown eventType ${row.eventType}`);
      return null;
    }
    if (this.seenEventIds.has(row.eventId)) {
      // 重投（提交后崩溃/双份拍）：去重窗吞掉，只标记不再收入待投批次。
      await this.markDispatched(tx, row.id);
      return null;
    }
    // 重建信封（对已注册类型为全函数·不抛）+ 事务内 claim（置 dispatchedAt）→ 收入待投批次，
    // 留待事务提交后 publishAll（甲档·见类头）。
    const instance = new EventClass({
      eventId: row.eventId,
      aggregateId: row.aggregateId,
      aggregateType: row.aggregateType,
      eventVersion: row.eventVersion,
      occurredAt: row.occurredAt,
      correlationId: row.metadata?.correlationId ?? undefined,
      causationId: row.metadata?.causationId ?? undefined,
      payload: row.payload,
    });
    await this.markDispatched(tx, row.id);
    this.rememberSeen(row.eventId);
    return instance;
  }

  /** 行级停重试：`attemptCount` 顶到上限使拉取条件（`< MAX`）自然排除，毒行不毒死 relay。 */
  private async parkRow(tx: EntityManager, row: Event, lastError: string): Promise<void> {
    await tx.nativeUpdate(
      Event,
      { id: row.id } as never,
      { attemptCount: OutboxRelay.MAX_ATTEMPTS, lastError } as never,
    );
  }

  private async markDispatched(tx: EntityManager, id: number): Promise<void> {
    await tx.nativeUpdate(Event, { id } as never, { dispatchedAt: new Date() } as never);
  }

  private rememberSeen(eventId: string): void {
    this.seenEventIds.set(eventId, true);
    if (this.seenEventIds.size > OutboxRelay.SEEN_CAP) {
      const oldest = this.seenEventIds.keys().next();
      if (!oldest.done) {
        this.seenEventIds.delete(oldest.value);
      }
    }
  }
}

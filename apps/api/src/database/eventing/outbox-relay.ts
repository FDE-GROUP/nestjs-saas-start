import { ConfigService } from '@app/config/config.service';
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
 * Outbox relay：event 表 → 进程内 EventBus 的耐久投递器（ES Phase B 后半 ·
 * module-es-outbox-transactional 切片 C·裁点丙=at-least-once·丁=行级标记跳过）。
 *
 * 仅 `EVENT_PUBLISH_MODE=outbox` 时启动（缺省 inproc 零 timer 零触库——DB-free 装配
 * 不变量不动）。每拍以 `FOR UPDATE SKIP LOCKED` 取一批未投递行（id 升序=流内保序·
 * 多实例并发安全），逐行：
 *  1. **拒收**比自己新的信封（`eventVersion > SUPPORTED`）→ 行级置 `lastError` 并把
 *     `attemptCount` 顶到上限停止重试（relay 整体不停摆·留表可查）；
 *  2. 未知 `eventType`（注册表外）→ 同 1（防毒行运行期才炸·注册表契约测本已双向锁）；
 *  3. 崩溃重投的 `eventId` 命中去重窗 → 只标记投递不再发（消费方幂等由 relay 端去重
 *     窗兜底·有界 LRU·重启后窗清空时消费者仍需自身幂等——roadmap 硬要求声明）；
 *  4. 经 `EVENT_TYPE_REGISTRY` 重建类实例投进程内总线，**成功后**才置 `dispatchedAt`
 *     （后置标记 = at-least-once：置位前崩溃必重投）；投递抛错 → `attemptCount+1` +
 *     `lastError`，超上限（默认 5）行级停重试并 error 留痕（DLQ 以表内状态表达）。
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
      return await em.transactional(async (tx) => {
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
        let processed = 0;
        for (const row of rows) {
          await this.dispatchRow(tx, row);
          processed++;
        }
        return processed;
      });
    } finally {
      this.ticking = false;
    }
  }

  private async dispatchRow(tx: EntityManager, row: Event): Promise<void> {
    if (row.eventVersion > OutboxRelay.SUPPORTED_EVENT_VERSION) {
      await this.parkRow(tx, row, `unsupported eventVersion ${row.eventVersion}`);
      this.logger.warn(
        `outbox parked row id=${row.id}: unsupported eventVersion ${row.eventVersion}（行级拒收·裁点丁）`,
      );
      return;
    }
    const EventClass = EVENT_TYPE_REGISTRY.get(row.eventType);
    if (!EventClass) {
      await this.parkRow(tx, row, `unknown eventType ${row.eventType}`);
      this.logger.warn(`outbox parked row id=${row.id}: unknown eventType ${row.eventType}`);
      return;
    }
    if (this.seenEventIds.has(row.eventId)) {
      // at-least-once 重投（置位前崩溃/双份拍）：去重窗吞掉，只标记不再下发。
      await this.markDispatched(tx, row.id);
      return;
    }
    try {
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
      this.eventBus.publishAll([instance]);
      await this.markDispatched(tx, row.id);
      this.rememberSeen(row.eventId);
    } catch (error: unknown) {
      const attempt = row.attemptCount + 1;
      const lastError = error instanceof Error ? error.message : String(error);
      await tx.nativeUpdate(
        Event,
        { id: row.id } as never,
        { attemptCount: attempt, lastError } as never,
      );
      if (attempt >= OutboxRelay.MAX_ATTEMPTS) {
        this.logger.error(
          `outbox row id=${row.id} exhausted ${attempt} attempts: ${lastError}（表内 DLQ 态·留人处置）`,
        );
      } else {
        this.logger.warn(`outbox row id=${row.id} attempt ${attempt} failed: ${lastError}`);
      }
    }
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

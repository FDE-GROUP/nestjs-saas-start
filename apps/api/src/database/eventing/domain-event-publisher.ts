import { ConfigService } from '@app/config/config.service';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { EVENT_STORE, type EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { TransactionScope } from './transaction-scope';

/**
 * `DomainEventPublisher` 默认实现（ES 首切片 · module-users-es-append §2.3；
 * ES Phase B 后半 · module-es-outbox-transactional 切片 B 扩为三模·裁点乙）。
 *
 * 三模语义（`EVENT_PUBLISH_MODE`·缺省 `inproc` 与旧布尔未置 true 逐字节等价）：
 *  - `inproc`：纯透传进程内总线，不触库（EDA Phase A 语义）；
 *  - `shadow`：先向 event store 耐久 append，再进程内 publishAll（旧双模保形）；
 *    append 失败**如实抛、不进总线**（宁缺勿错发）。
 *  - `outbox`：**只在活跃 UoW 事务内** append（`fork()` 经 ALS 复用事务 em——域行与
 *    事件行同生共死），**不**进程内派发；投递交 relay（切片 C·at-least-once）。
 *    事务外调用 fail-loud：同事务是 outbox 的硬要求，脱了它语义即假。
 *
 * token 随 @Global DatabaseModule exports 装配。
 */
@Injectable()
export class DefaultDomainEventPublisher implements DomainEventPublisher {
  constructor(
    @Inject(EventBus) private readonly eventBus: EventBus,
    @Inject(EVENT_STORE) private readonly store: EventStore,
    @Inject(ConfigService) private readonly configService: ConfigService,
    // S9 教训：显式 @Inject + 值导入；outbox 的事务在场判据（同库单源 ALS）
    @Inject(TransactionScope) private readonly txScope: TransactionScope,
  ) {}

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const mode = this.configService.getEventPublishConfig().mode;
    if (mode === 'outbox') {
      if (!this.txScope.current()) {
        throw new Error(
          'EVENT_PUBLISH_MODE=outbox requires publishAll() inside an active unit of work ' +
            '(域行与事件行必须同事务·见 module-es-outbox-transactional §2.1)',
        );
      }
      await this.store.append(events);
      return;
    }
    if (mode === 'shadow') {
      await this.store.append(events);
    }
    this.eventBus.publishAll([...events]);
  }
}

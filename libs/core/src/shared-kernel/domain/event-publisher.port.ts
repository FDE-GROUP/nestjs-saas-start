import type { DomainEvent } from './domain-event';

/**
 * 领域事件发布端口（ES 首切片 · module-users-es-append §2.3）。
 *
 * 收口 command handler 的派发点：实现侧封装「event store 启用则先耐久 append，
 * 再进程内 publishAll（EDA Phase A 语义无条件保留）」的双模顺序——append 失败
 * 则不进总线（宁缺勿错发）。handler 只依赖本端口，不再直注 EventBus，
 * 未来写路径切换（Phase B 后半）同样只动实现不动 handler。
 */
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');

export interface DomainEventPublisher {
  publishAll(events: readonly DomainEvent[]): Promise<void>;
  /**
   * ES 真相源写切换（module-es-r1-replay-core §3-R1c·可选方法·存量实现/测试替身零感）：
   * 「耐久真相优先」的发布形——先向 event store 带乐观锁 `append(events, expectedVersion)`
   * （同事务·失败整批不写），再按 `EVENT_PUBLISH_MODE` 派发：`inproc`/`shadow` 立即进程内
   * 派发（EDA Phase A 同步订阅不断）；`outbox` 不即时派发（同事务落库的未投递行由 relay 异步投）。
   * 与 `publishAll` 的关键差异：本方法**总是**耐久 append（不受 mode 门控）且携 `expectedVersion`，
   * 故调用方不得同时再调 `publishAll`（会二次 append 同版本键冲突 fail-loud）。
   */
  publishDurable?(events: readonly DomainEvent[], expectedVersion: number): Promise<void>;
}

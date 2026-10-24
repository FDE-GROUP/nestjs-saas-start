import type { DomainEvent } from './domain-event';

/**
 * Event store 端口的 DI 注入 token（ES 首切片 · module-users-es-append §2.2，沿 S10 P1 端口倒置先例）。
 *
 * @remarks
 * core 侧只声明契约（纯类型，零 ORM/Nest 依赖）；持久化原语由参考应用的
 * 旧 ORM 适配实现并注入。首切片为 **shadow append**：CRUD 仍是唯一真相源，
 * append 只是把事件耐久落表供未来回放/审计，不提供读取/重放语义。
 *
 * 约定：`append` 对空批 noop；唯一键（aggregateType, aggregateId, version）冲突
 * **如实抛错**（fail-loud，不静默吞、不重试覆盖）。
 *
 * `append(events, expectedVersion?)`（ES R1a · module-es-r1-replay-core §3-R1a）：可选乐观锁——
 * 提供时要求流当前 max+1 === expectedVersion，否则 fail-loud 整批不写；缺省不校验 =
 * 既有行为逐字节不变（shadow/outbox 发布器与全部现存调用方零感）。
 *
 * `load`（ES R1a 新增·回放读取语义）：按流 version 升序返回重建的事件实例（经事件类注册表
 * 反序列化·信封显式值透传不重掷）；未知 eventType fail-loud 拒回放——「回放即真相」的读入口，
 * 真相源切换（R1c）前既有调用方零存，本方法仅新面。
 *
 * `deleteByAggregate` 为 PIPL 级联补删面（module-tenancy-es-lifecycle-events §3.2）：
 * 用户硬删后其事件行不会被任何 FK 机制清除（event 表无 FK），由应用层显式调用；
 * **不受** EVENT_PUBLISH_MODE 开关控制——表在就要清，开关只管写入。
 *
 * @public
 */
export const EVENT_STORE = Symbol('EVENT_STORE');

/**
 * 事件耐久存储端口（append / 回放 load / 级联补删）。
 *
 * @public
 */
export interface EventStore {
  /**
   * 耐久追加一批事件（空批 noop·唯一键冲突 fail-loud）。
   *
   * @param events - 待落库的事件（只读）
   * @param expectedVersion - 可选乐观锁：要求流当前 max+1 === 该值，否则整批不写
   */
  append(events: readonly DomainEvent[], expectedVersion?: number): Promise<void>;
  /**
   * 按流 version 升序回放读取事件实例（未知 eventType fail-loud 拒回放）。
   *
   * @param aggregateType - 聚合类型
   * @param aggregateId - 聚合 id
   * @returns 重建的领域事件实例数组
   */
  load(aggregateType: string, aggregateId: string): Promise<DomainEvent[]>;
  /**
   * 级联补删某聚合的全部事件行（PIPL·不受发布模式开关控制）。
   *
   * @param aggregateType - 聚合类型
   * @param aggregateId - 聚合 id
   * @returns 被删除的行数
   */
  deleteByAggregate(aggregateType: string, aggregateId: string): Promise<number>;
}

import { uuidv7 } from '../util/uuid-v7';

/**
 * 领域事件元数据信封入参（构造 `DomainEvent` 的原始 props）。
 *
 * @remarks
 * The field set (eventId / aggregateId / aggregateType / eventType / eventVersion /
 * occurredAt / correlationId / causationId) is intentionally shaped for a future
 * Event Sourcing store: these are exactly the columns an append-only event table
 * needs, and `eventVersion` is what an upcaster keys off when the payload schema
 * evolves. For now events are dispatched in-process only (never persisted).
 *
 * @public
 */
export interface DomainEventProps<TPayload extends object = object> {
  /** 事件所属聚合根 id。 */
  readonly aggregateId: string;
  /** 事件所属聚合类型名。 */
  readonly aggregateType: string;
  /** 事件类型名（稳定契约）。 */
  readonly eventType: string;
  /** 事件负载。 */
  readonly payload: TPayload;
  /** 事件唯一 id。 */
  readonly eventId?: string;
  /** 事件 schema 版本。 */
  readonly eventVersion?: number;
  /** 事件发生时间。 */
  readonly occurredAt?: Date;
  /** 关联 id：贯穿一次请求链。 */
  readonly correlationId?: string;
  /** 因果链：直接触发本事件的事件 id。 */
  readonly causationId?: string;
}

/**
 * 框架无关的领域事件基类（ES 钩子 #3）。
 *
 * @remarks
 * Concrete events live next to their aggregate and carry the payload as a typed object.
 * Must never import Nest/ORM packages.
 *
 * @public
 */
export abstract class DomainEvent<TPayload extends object = object> {
  /** 事件唯一 id。 */
  readonly eventId: string;
  /** 事件所属聚合根 id。 */
  readonly aggregateId: string;
  /** 事件所属聚合类型名。 */
  readonly aggregateType: string;
  /** 事件类型名（稳定契约）。 */
  readonly eventType: string;
  /** 事件 schema 版本。 */
  readonly eventVersion: number;
  /** 事件发生时间。 */
  readonly occurredAt: Date;
  /** 关联 id：贯穿一次请求链。 */
  readonly correlationId?: string;
  /** 因果链：直接触发本事件的事件 id。 */
  readonly causationId?: string;
  /** 事件负载。 */
  readonly payload: TPayload;

  protected constructor(props: DomainEventProps<TPayload>) {
    this.eventId = props.eventId ?? uuidv7();
    this.aggregateId = props.aggregateId;
    this.aggregateType = props.aggregateType;
    this.eventType = props.eventType;
    this.eventVersion = props.eventVersion ?? 1;
    this.occurredAt = props.occurredAt ?? new Date();
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.payload = props.payload;
  }
}

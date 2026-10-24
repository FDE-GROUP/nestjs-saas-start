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
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly eventId?: string;
  readonly eventVersion?: number;
  readonly occurredAt?: Date;
  readonly correlationId?: string;
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
  readonly eventId: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly occurredAt: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
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

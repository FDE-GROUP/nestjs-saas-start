import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { describe, expect, it, vi } from 'vitest';
import { DefaultDomainEventPublisher } from './domain-event-publisher';
import { TransactionScope } from './transaction-scope';

function makeEvent(): DomainEvent {
  return {
    eventId: 'evt-1',
    aggregateId: 'user-1',
    aggregateType: 'user',
    eventType: 'user.registered',
    eventVersion: 1,
    occurredAt: new Date(),
    payload: { id: 'user-1' },
  } as unknown as DomainEvent;
}

function makePublisher(opts: {
  mode: 'inproc' | 'shadow' | 'outbox';
  appendError?: Error;
  /** true → 在活跃 UoW 事务内调用（真 TransactionScope·零依赖类直 new）。 */
  inTx?: boolean;
}) {
  const order: string[] = [];
  const eventBus = {
    publishAll: vi.fn(() => {
      order.push('bus');
    }),
  };
  const store = {
    append: vi.fn(async () => {
      if (opts.appendError) throw opts.appendError;
      order.push('append');
    }),
  };
  const configService = {
    getEventPublishConfig: () => ({ mode: opts.mode, pollMs: 1000 }),
  };
  const txScope = new TransactionScope();
  const publisher = new DefaultDomainEventPublisher(
    eventBus as never,
    store as never,
    configService as never,
    txScope,
  );
  const publish = (events: readonly DomainEvent[]) =>
    opts.inTx
      ? txScope.run({ name: 'tx-em' } as never, () => publisher.publishAll(events))
      : publisher.publishAll(events);
  return { publisher, publish, eventBus, store, order };
}

describe('DefaultDomainEventPublisher (ES Phase B 后半 · 三模 seam · module-es-outbox-transactional 切片 B)', () => {
  it('inproc: pure pass-through to the in-process bus, store never touched', async () => {
    const { publish, eventBus, store, order } = makePublisher({ mode: 'inproc' });
    const events = [makeEvent()];
    await publish(events);
    expect(store.append).not.toHaveBeenCalled();
    expect(eventBus.publishAll).toHaveBeenCalledWith(events);
    expect(order).toEqual(['bus']);
  });

  it('shadow: durable append strictly BEFORE in-process publish (旧双模保形)', async () => {
    const { publish, eventBus, store, order } = makePublisher({ mode: 'shadow' });
    const events = [makeEvent()];
    await publish(events);
    expect(store.append).toHaveBeenCalledWith(events);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['append', 'bus']);
  });

  it('shadow: append failure propagates fail-loud and the bus is NOT reached (宁缺勿错发)', async () => {
    const { publish, eventBus, order } = makePublisher({
      mode: 'shadow',
      appendError: new Error('duplicate key'),
    });
    await expect(publish([makeEvent()])).rejects.toThrow('duplicate key');
    expect(eventBus.publishAll).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it('outbox · 事务外：fail-loud（同事务硬要求），append/bus 皆不触', async () => {
    const { publish, eventBus, store, order } = makePublisher({ mode: 'outbox' });
    await expect(publish([makeEvent()])).rejects.toThrow(/unit of work/);
    expect(store.append).not.toHaveBeenCalled();
    expect(eventBus.publishAll).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it('outbox · 事务内：只 append（交 relay 投递），进程内总线此刻零发', async () => {
    const { publish, eventBus, store, order } = makePublisher({ mode: 'outbox', inTx: true });
    const events = [makeEvent()];
    await publish(events);
    expect(store.append).toHaveBeenCalledWith(events);
    expect(eventBus.publishAll).not.toHaveBeenCalled();
    expect(order).toEqual(['append']);
  });

  it('empty batch touches nothing (any mode)', async () => {
    for (const mode of ['inproc', 'shadow', 'outbox'] as const) {
      const { publish, eventBus, store } = makePublisher({ mode });
      await publish([]);
      expect(store.append).not.toHaveBeenCalled();
      expect(eventBus.publishAll).not.toHaveBeenCalled();
    }
  });
});

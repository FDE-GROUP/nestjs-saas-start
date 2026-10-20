import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroEventStore } from './mikro-event-store';

function makeEvent(over: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'evt-1',
    aggregateId: 'user-1',
    aggregateType: 'user',
    eventType: 'user.registered',
    eventVersion: 1,
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    payload: { id: 'user-1', email: 'a@example.com' },
    ...over,
  } as unknown as DomainEvent;
}

function makeEm(
  opts: { topVersion?: number | null; insertError?: Error; deleteCount?: number } = {},
) {
  const inserted: Record<string, unknown>[] = [];
  const findCalls: unknown[][] = [];
  const em = {
    find: vi.fn(async (...args: unknown[]) => {
      findCalls.push(args);
      return opts.topVersion == null ? [] : [{ version: opts.topVersion }];
    }),
    insert: vi.fn(async (_entity: unknown, row: Record<string, unknown>) => {
      if (opts.insertError) throw opts.insertError;
      inserted.push(row);
      return { id: inserted.length };
    }),
    nativeDelete: vi.fn(async () => opts.deleteCount ?? 0),
  };
  return { em, inserted, findCalls };
}

function makeStore(em: unknown): MikroEventStore {
  return new MikroEventStore({ fork: async () => em } as never);
}

describe('MikroEventStore (ORM 修宪案 B · 切片 3c-ii-C · shadow append 语义镜像旧语义)', () => {
  let fixture: ReturnType<typeof makeEm>;
  let store: MikroEventStore;

  beforeEach(() => {
    fixture = makeEm();
    store = makeStore(fixture.em);
  });

  it('noops on an empty batch (never touches the db)', async () => {
    await store.append([]);
    expect(fixture.em.find).not.toHaveBeenCalled();
    expect(fixture.em.insert).not.toHaveBeenCalled();
  });

  it('maps the full envelope faithfully onto event columns', async () => {
    const event = makeEvent({ correlationId: 'corr-1' });
    await store.append([event]);
    expect(fixture.inserted).toHaveLength(1);
    expect(fixture.inserted[0]).toEqual({
      eventId: 'evt-1',
      aggregateId: 'user-1',
      aggregateType: 'user',
      version: 1,
      eventType: 'user.registered',
      eventVersion: 1,
      payload: { id: 'user-1', email: 'a@example.com' },
      metadata: { correlationId: 'corr-1', causationId: null },
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('derives version as max(version)+1 per stream (plan §6 audit amendment)', async () => {
    fixture = makeEm({ topVersion: 3 });
    store = makeStore(fixture.em);
    await store.append([makeEvent()]);
    expect(fixture.inserted[0].version).toBe(4);
  });

  it('appends every event of a batch (one version lookup per event)', async () => {
    await store.append([makeEvent({ eventId: 'evt-1' }), makeEvent({ eventId: 'evt-2' })]);
    expect(fixture.em.insert).toHaveBeenCalledTimes(2);
    expect(fixture.em.find).toHaveBeenCalledTimes(2);
    expect(fixture.inserted.map((row) => row.eventId)).toEqual(['evt-1', 'evt-2']);
  });

  it('propagates unique-key / db errors fail-loud (never swallows)', async () => {
    fixture = makeEm({ insertError: new Error('duplicate key event_aggregate_version_key') });
    store = makeStore(fixture.em);
    await expect(store.append([makeEvent()])).rejects.toThrow('duplicate key');
  });

  it('deleteByAggregate issues a scoped nativeDelete and returns the purged row count（PIPL §3.2）', async () => {
    fixture = makeEm({ deleteCount: 2 });
    store = makeStore(fixture.em);
    await expect(store.deleteByAggregate('user', 'user-1')).resolves.toBe(2);
    expect(fixture.em.nativeDelete).toHaveBeenCalledTimes(1);
  });

  it('deleteByAggregate returns 0 when the stream never existed (no error)', async () => {
    await expect(store.deleteByAggregate('user', 'ghost')).resolves.toBe(0);
  });
});

import type { ConfigService } from '@app/config/config.service';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { EventBus } from '@nestjs/cqrs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../mikro/four-tables';
import type { MikroOrmService } from '../mikro/mikro-orm.service';
import { OutboxRelay } from './outbox-relay';

/**
 * `OutboxRelay` 单测（module-es-outbox-transactional 切片 C）：投递决策全矩阵走 mock em，
 * 真库往返（SKIP LOCKED/重投/标记）由 env-gated e2e 承担（切片 D）。
 */

interface RowSeed {
  id: number;
  eventId?: string;
  eventType?: string;
  eventVersion?: number;
  attemptCount?: number;
  metadata?: Record<string, unknown> | null;
}

function makeRow(seed: RowSeed): Event {
  return {
    id: seed.id,
    eventId: seed.eventId ?? `evt-${seed.id}`,
    aggregateId: 'org-1',
    aggregateType: 'tenant',
    version: 1,
    eventType: seed.eventType ?? 'tenant.rejected',
    eventVersion: seed.eventVersion ?? 1,
    payload: { actorId: 'op-1' },
    metadata: seed.metadata ?? { correlationId: 'corr-1', causationId: null },
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dispatchedAt: null,
    attemptCount: seed.attemptCount ?? 0,
    lastError: null,
  } as unknown as Event;
}

function makeRelay(
  rows: Event[],
  opts: { mode?: 'inproc' | 'shadow' | 'outbox'; publishError?: Error } = {},
) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const published: DomainEvent[][] = [];
  const tx = {
    find: vi.fn(async () => rows),
    nativeUpdate: vi.fn(async (_entity: unknown, where: unknown, data: Record<string, unknown>) => {
      updates.push({ where, data });
    }),
  };
  const em = { transactional: async (cb: (t: typeof tx) => Promise<number>) => cb(tx) };
  const mikro = { fork: async () => em };
  const config = {
    getEventPublishConfig: () => ({ mode: opts.mode ?? 'outbox', pollMs: 1000 }),
  };
  const eventBus = {
    publishAll: vi.fn((batch: DomainEvent[]) => {
      if (opts.publishError) throw opts.publishError;
      published.push(batch);
    }),
  };
  const relay = new OutboxRelay(
    config as unknown as ConfigService,
    mikro as unknown as MikroOrmService,
    eventBus as unknown as EventBus,
  );
  return { relay, updates, published, tx, eventBus };
}

describe('OutboxRelay（切片 C · at-least-once + 行级拒收 + 去重窗）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('非 outbox 模式不启 timer（DB-free 不变量：缺省零触库零调度）', () => {
    const { relay } = makeRelay([], { mode: 'inproc' });
    relay.onApplicationBootstrap();
    expect((relay as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('outbox 模式启 timer 且 onModuleDestroy 摘停', () => {
    const { relay } = makeRelay([]);
    relay.onApplicationBootstrap();
    expect((relay as unknown as { timer?: unknown }).timer).toBeDefined();
    relay.onModuleDestroy();
    expect((relay as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('正常行：重建实例忠实投 bus，投递后才置 dispatchedAt（at-least-once 后置标记）', async () => {
    const row = makeRow({ id: 7 });
    const { relay, updates, published } = makeRelay([row]);
    expect(await relay.tickOnce()).toBe(1);
    expect(published).toHaveLength(1);
    const instance = published[0][0];
    expect(instance).toMatchObject({
      eventId: 'evt-7',
      aggregateId: 'org-1',
      aggregateType: 'tenant',
      eventType: 'tenant.rejected',
      eventVersion: 1,
      correlationId: 'corr-1',
      payload: { actorId: 'op-1' },
    });
    expect(instance.occurredAt).toBe(row.occurredAt);
    expect(updates).toHaveLength(1);
    expect(updates[0].data.dispatchedAt).toBeInstanceOf(Date);
  });

  it('版本拒收（裁点丁）：eventVersion 超上限 → 行级 park 停重试，relay 不停摆、零投', async () => {
    const row = makeRow({ id: 8, eventVersion: 99 });
    const { relay, updates, published } = makeRelay([row]);
    expect(await relay.tickOnce()).toBe(1);
    expect(published).toHaveLength(0);
    expect(updates[0].data).toMatchObject({
      attemptCount: OutboxRelay.MAX_ATTEMPTS,
      lastError: 'unsupported eventVersion 99',
    });
  });

  it('未知 eventType：行级 park（毒行不毒死投递线），零投', async () => {
    const row = makeRow({ id: 9, eventType: 'mystery.event' });
    const { relay, updates, published } = makeRelay([row]);
    await relay.tickOnce();
    expect(published).toHaveLength(0);
    expect(updates[0].data.lastError).toBe('unknown eventType mystery.event');
  });

  it('崩溃重投：同 eventId 第二次出现 → 去重窗吞掉，只标记不再投', async () => {
    const row = makeRow({ id: 10 });
    const { relay, updates, published } = makeRelay([row]);
    await relay.tickOnce();
    expect(published).toHaveLength(1);
    // 模拟置位前崩溃：下拍同行再被拉取
    await relay.tickOnce();
    expect(published).toHaveLength(1);
    expect(updates).toHaveLength(2);
    expect(updates[1].data.dispatchedAt).toBeInstanceOf(Date);
  });

  it('投递抛错：attemptCount+1 + lastError，不中断整批；达上限走 exhausted 留痕', async () => {
    const ok = makeRow({ id: 11 });
    const bad = makeRow({ id: 12, eventType: 'tenant.status.transitioned' });
    const { relay, updates } = makeRelay([bad, ok], {
      publishError: new Error('bus exploded'),
    });
    await relay.tickOnce();
    // bad 行 attempt+1 留错；ok 行同样尝试并失败标记（本 mock 下两行皆失败）
    const failedUpdates = updates.filter((u) => u.data.attemptCount === 1);
    expect(failedUpdates).toHaveLength(2);
    expect(failedUpdates[0].data.lastError).toBe('bus exploded');
    // 上限位：attemptCount=MAX-1 的行失败后应顶到 MAX（exhausted 分支跑过即不抛）
    const last = makeRow({ id: 13, attemptCount: OutboxRelay.MAX_ATTEMPTS - 1 });
    const second = makeRelay([last], { publishError: new Error('still broken') });
    await second.relay.tickOnce();
    expect(second.updates[0].data.attemptCount).toBe(OutboxRelay.MAX_ATTEMPTS);
  });

  it('防重入：上一拍未完时立即返回 0（timer 拍不叠加）', async () => {
    const { relay } = makeRelay([]);
    (relay as unknown as { ticking: boolean }).ticking = true;
    expect(await relay.tickOnce()).toBe(0);
  });
});

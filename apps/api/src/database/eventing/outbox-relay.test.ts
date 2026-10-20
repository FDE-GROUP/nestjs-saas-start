import type { ConfigService } from '@app/config/config.service';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { EventBus } from '@nestjs/cqrs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MikroOrmService } from '../mikro/mikro-orm.service';
import type { Event } from './entities/event.entity';
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
  opts: { mode?: 'inproc' | 'shadow' | 'outbox'; publishThrows?: boolean } = {},
) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const published: DomainEvent[][] = [];
  const tx = {
    find: vi.fn(async () => rows),
    nativeUpdate: vi.fn(async (_entity: unknown, where: unknown, data: Record<string, unknown>) => {
      updates.push({ where, data });
    }),
  };
  // mock 事务边界：cb 在 tx 上执行并返回其值（返回结构由被测 tickOnce 决定·此处泛化）。
  const em = {
    transactional: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  };
  const mikro = { fork: async () => em };
  const config = {
    getEventPublishConfig: () => ({ mode: opts.mode ?? 'outbox', pollMs: 1000 }),
  };
  const eventBus = {
    // 真 `@nestjs/cqrs` publishAll 同步入队·fire-and-forget：handler 异常不回抛。本 mock 忠实于
    // 「入队即返回」（push 记录批次）；`publishThrows` 仅用于验「即便总线抛错也不回滚 claim」。
    publishAll: vi.fn((batch: DomainEvent[]) => {
      if (opts.publishThrows) throw new Error('bus exploded');
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

describe('OutboxRelay（切片 C · 甲档：事务内 claim + 提交后投递 + 行级拒收 + 去重窗）', () => {
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

  it('正常行：重建实例忠实收入待投批次·事务内置 dispatchedAt（claim）后于提交后投递', async () => {
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

  it('提交后尽力投递（甲档）：publishAll 抛错不回滚 claim、不动 attemptCount、tickOnce 不 reject', async () => {
    const row = makeRow({ id: 11 });
    const { relay, updates, published } = makeRelay([row], { publishThrows: true });
    await expect(relay.tickOnce()).resolves.toBe(1);
    // claim 已在事务内置位（dispatchedAt），提交后投递抛错不回退、不记 attemptCount（非投递失败语义）。
    expect(updates).toHaveLength(1);
    expect(updates[0].data.dispatchedAt).toBeInstanceOf(Date);
    expect(updates[0].data.attemptCount).toBeUndefined();
    expect(published).toHaveLength(0); // publishAll 抛错前未记录（但 claim 已成·下拍不重取）
  });

  it('行级 park 顶至 MAX 使拉取条件自然排除（毒信封不毒死 relay）', async () => {
    // 仅对可确定识别的毒信封（版本/类型）置 attemptCount=MAX；投递失败不属此类（见上测）。
    const last = makeRow({ id: 13, attemptCount: OutboxRelay.MAX_ATTEMPTS - 1, eventVersion: 99 });
    const { relay, updates } = makeRelay([last]);
    await relay.tickOnce();
    expect(updates[0].data.attemptCount).toBe(OutboxRelay.MAX_ATTEMPTS);
  });

  it('防重入：上一拍未完时立即返回 0（timer 拍不叠加）', async () => {
    const { relay } = makeRelay([]);
    (relay as unknown as { ticking: boolean }).ticking = true;
    expect(await relay.tickOnce()).toBe(0);
  });

  it('事务回滚 → 零投递（甲档 post-commit 消灭幻影事件）', async () => {
    // mock：cb 在 tx 内已 claim，但**提交阶段回滚**（transactional 拒接）。
    // 旧实现在事务内 publishAll → 回滚前已下发→幻影；甲档把下发挪到提交后 → 本景下零投递。
    const rows = [makeRow({ id: 21 })];
    const tx = {
      find: vi.fn(async () => rows),
      nativeUpdate: vi.fn(async () => {}),
    };
    const em = {
      transactional: async (cb: (t: typeof tx) => Promise<unknown>) => {
        await cb(tx);
        throw new Error('commit failed'); // 模拟提交回滚
      },
    };
    const published: DomainEvent[] = [];
    const relay = new OutboxRelay(
      { getEventPublishConfig: () => ({ mode: 'outbox', pollMs: 1000 }) } as unknown as ConfigService,
      { fork: async () => em } as unknown as MikroOrmService,
      { publishAll: (batch: DomainEvent[]) => published.push(...batch) } as unknown as EventBus,
    );
    await expect(relay.tickOnce()).rejects.toThrow('commit failed');
    expect(published).toHaveLength(0); // 未提交 → 绝不下发（幻影事件消灭）
  });
});

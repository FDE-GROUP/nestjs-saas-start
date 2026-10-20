import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { UserStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/user-status-transitioned.event';
import { QueryOrder } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Event } from '../mikro/four-tables';
import { MikroOrmService } from '../mikro/mikro-orm.service';
import { MikroEventStore } from './mikro-event-store';
import { TransactionScope } from './transaction-scope';

/**
 * ORM 修宪案 B · 切片 3c-ii-C —— MikroEventStore **真库往返**（env-gated）。
 *
 * ORM 修宪案 B · Phase 2（旧 ORM 全退场）后，本测为 ES 影子追加面的**唯一**真库往返证据：坐实
 * `MikroEventStore` 语义——信封→列逐字节忠实、`version` 按流 max+1 递增、重复 `eventId`/唯一键
 * fail-loud、`deleteByAggregate` PIPL 级联补删返条数、以及「同聚合跨事件类型共一条连续版本序列」不变量。
 *
 * 写面走 `MikroEventStore`（生产 `EVENT_STORE` 绑定），读回经 `MikroOrmService.fork()` 的 `em.find(Event,…)`
 * 直读同物理 `event` 表——旧 ORM 交叉验证面已随依赖退场，现由 Mikro 自读自证（append-only 表·读写通道
 * 独立 em·无 Identity Map 干扰）。
 *
 * 仅当 `E2E_DATABASE_URL` 存在且目标库**已含 event 表**时运行；默认 CI 跳过、不触库（DB-free 不变量）。
 * Mikro 侧仅 `em.insert`/`find`/`nativeDelete` 写读、**不建表不迁移**。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

function makeUserStatusEvent(aggregateId: string, eventId?: string): UserStatusTransitionedEvent {
  // 架构精度修宪 S1：UserRegisteredEvent 随聚合死管道删除——夹具换同聚合流（'user'）的
  // UserStatusTransitionedEvent，event store 语义断言面不变（信封/version/唯一键/级联补删）。
  return new UserStatusTransitionedEvent({
    ...(eventId === undefined ? {} : { eventId }),
    aggregateId,
    payload: {
      from: 'active',
      to: 'suspended',
      actorId: 'seed',
    },
  });
}

gated('MikroEventStore real-DB round trip (ORM 修宪案 B · 切片 3c-ii-C · env-gated)', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;
  const aggregateIds: string[] = [];

  beforeAll(async () => {
    mikro = new MikroOrmService(
      { getDatabaseConfig: () => ({ url: E2E_DB }) } as never,
      // ES Phase B 后半：真 TransactionScope（事务外 fork 行为不变）
      new TransactionScope(),
    );
    store = new MikroEventStore(mikro);
  });

  afterAll(async () => {
    if (aggregateIds.length > 0) {
      const em = await mikro.fork();
      await em.nativeDelete(Event, { aggregateId: { $in: aggregateIds } } as never);
    }
    await mikro.onModuleDestroy();
  });

  /** 按流读回（version 升序）——同物理 event 表·Mikro 自读。 */
  async function readStream(aggregateId: string) {
    const em = await mikro.fork();
    return em.find(Event, { aggregateId } as never, { orderBy: { version: QueryOrder.ASC } });
  }

  it('persists the envelope faithfully and increments version per stream', async () => {
    const aggregateId = `es-mikro-${Date.now()}`;
    aggregateIds.push(aggregateId);
    const first = makeUserStatusEvent(aggregateId);
    await store.append([first]);
    const second = makeUserStatusEvent(aggregateId, randomUUID());
    await store.append([second]);

    const rows = await readStream(aggregateId);

    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows[0].eventId).toBe(first.eventId);
    expect(rows[0].aggregateType).toBe('user');
    expect(rows[0].eventType).toBe('user.status.transitioned');
    expect(rows[0].eventVersion).toBe(1);
    expect(rows[0].payload).toEqual(first.payload);
    expect(rows[0].occurredAt.getTime()).toBe(first.occurredAt.getTime());
  });

  it('re-appending the same eventId fails loud on the unique key', async () => {
    const aggregateId = `es-mikro-dup-${Date.now()}`;
    aggregateIds.push(aggregateId);
    const duplicate = makeUserStatusEvent(aggregateId);
    await store.append([duplicate]);
    await expect(store.append([duplicate])).rejects.toThrow();
  });

  it('tenant stream increments per stream and purges via deleteByAggregate（PIPL §3.2）', async () => {
    const orgId = `es-mikro-tenant-${Date.now()}`;
    aggregateIds.push(orgId);
    await store.append([
      new TenantStatusTransitionedEvent({
        aggregateId: orgId,
        payload: { from: 'pending_approval', to: 'active', actorId: 'op-1' },
      }),
    ]);
    await store.append([
      new TenantStatusTransitionedEvent({
        aggregateId: orgId,
        payload: { from: 'active', to: 'suspended', actorId: 'op-2', reason: 'abuse' },
      }),
    ]);

    const rows = await readStream(orgId);
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows[0].aggregateType).toBe('tenant');

    // PIPL 级联补删真库归零：nativeDelete 返删除条数，再查余 0 行
    await expect(store.deleteByAggregate('tenant', orgId)).resolves.toBe(2);
    const remaining = await readStream(orgId);
    expect(remaining).toHaveLength(0);
  });

  it('deleteByAggregate only purges the target aggregate (scoped, not global)', async () => {
    const victim = `es-mikro-piplt-${Date.now()}`;
    const bystander = `es-mikro-bystander-${Date.now()}`;
    aggregateIds.push(victim, bystander);
    await store.append([makeUserStatusEvent(victim), makeUserStatusEvent(bystander)]);

    await expect(store.deleteByAggregate('user', victim)).resolves.toBe(1);
    const left = await readStream(bystander);
    expect(left).toHaveLength(1);
  });

  it('user stream shares one version sequence across event kinds; PIPL purge covers both（第三切片同流不变量）', async () => {
    const userId = `es-mikro-same-stream-${Date.now()}`;
    aggregateIds.push(userId);
    // registered=1 → status.transitioned=2：不同 eventType 同 (user, userId) 流连续递增
    await store.append([makeUserStatusEvent(userId)]);
    await store.append([
      new UserStatusTransitionedEvent({
        aggregateId: userId,
        payload: { from: 'active', to: 'suspended', actorId: 'op-1', reason: 'fraud' },
      }),
    ]);

    const rows = await readStream(userId);
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows.map((row) => row.eventType)).toEqual([
      'user.status.transitioned',
      'user.status.transitioned',
    ]);

    // deleteByAggregate('user', id) 零额外代码一并归零两类事件
    await expect(store.deleteByAggregate('user', userId)).resolves.toBe(2);
    const remaining = await readStream(userId);
    expect(remaining).toHaveLength(0);
  });
});

/*
 * 本地跑法（沿用租户隔离 e2e 的专用 nestjs_e2e 库先例·库须已建含 event 表的 schema）：
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/database/event-store.mikro.e2e.test.ts
 */

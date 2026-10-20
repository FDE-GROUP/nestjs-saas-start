import 'reflect-metadata';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@app/config/config.service';
import { Organization } from '@app/database/mikro/entities';
import { TenantRejectedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-rejected.event';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { EventBus } from '@nestjs/cqrs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MikroOrmService } from '../mikro/mikro-orm.service';
import { DefaultDomainEventPublisher } from './domain-event-publisher';
import { Event } from './entities/event.entity';
import { EVENT_TYPE_REGISTRY } from './event-type-registry';
import { MikroEventStore } from './mikro-event-store';
import { MikroUnitOfWork } from './mikro-unit-of-work';
import { OutboxRelay } from './outbox-relay';
import { TransactionScope } from './transaction-scope';

/**
 * Outbox 同事务化 + relay 耐久投递 **真库往返**（module-es-outbox-transactional 切片 D · env-gated）。
 *
 * 坐实单测 mock 面覆盖不了的三条硬证据：
 *  1. **同生共死**：事务内业务行 + 事件行一起提交；事件 append fail-loud → 业务行**一并回滚**
 *     （dual-write 窗口消灭的直接反证）；
 *  2. relay 真 SQL 面：`FOR UPDATE SKIP LOCKED` 拉取、`dispatchedAt` 置位、版本拒收/去重重投
 *     在物理表上的最终形态；
 *  3. publisher 的 outbox 守卫：事务外 `publishAll` fail-loud。
 *
 * 总线用收集替身（派发忠实性已由 `outbox-relay.test.ts` 单测锁），本测只验投递**决定**与
 * 表内状态。仅 `E2E_DATABASE_URL` 存在且库已含 event 投递列时运行；默认 CI 跳过（DB-free 不变量）。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

/**
 * B1 互斥锁（module-ci-gated-e2e-isolation·人 2026-10-17 裁 B1）：共享 nestjs_e2e 库的 gated e2e 并行跑，
 * 而 `tickOnce` 是全局捞行（产品设计·非目标不改）——tenant-status-link 的 drain tick 与本文件
 * 「自属 relay 捞行→自属总线」窃取权真竞态（跨进程 bus 互不可见，竞态即非确定性红）。锁只在测试
 * 进程层：O_EXCL 锁文件 + PID stale 接管；两文件均作文件级临界区（beforeAll 持到 afterAll）全生命
 * 周期串行——共用一把锁但并行时仍会互吞对侧未派发行（被吞方自己的总线拿不到事件），必须串行。
 * 同一小锁实现在两测试文件内联复制（test-only·免新增文件触构建收集面）。
 */
const RELAY_LOCK = join(tmpdir(), 'nestjs-e2e-outbox-relay.lock');

async function acquireRelayLock(): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      writeFileSync(RELAY_LOCK, String(process.pid), { flag: 'wx' });
      return;
    } catch {
      let holderAlive = true;
      try {
        const owner = Number(readFileSync(RELAY_LOCK, 'utf8').trim());
        if (!Number.isInteger(owner) || owner <= 0) {
          holderAlive = false;
        } else {
          process.kill(owner, 0); // 存活 → true；不存在 → 抛 ESRCH
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH')
          holderAlive = false; // stale → 夺回
        else if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          continue; // 锁刚被释放 → 重试创建
        else throw error; // deadline 超时等自建错误原样冒泡
      }
      if (holderAlive) {
        if (Date.now() > deadline) throw new Error('relay e2e lock acquire timeout (30s)');
      } else {
        try {
          unlinkSync(RELAY_LOCK);
        } catch {
          /* 并发夺回已做，继续自旋 */
        }
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

function releaseRelayLock(): void {
  try {
    unlinkSync(RELAY_LOCK);
  } catch {
    /* 已被 stale 接管，幂等 */
  }
}

gated('Outbox + relay real-DB round trip (module-es-outbox-transactional · env-gated)', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;
  let scope: TransactionScope;
  let uow: MikroUnitOfWork;
  let published: DomainEvent[];
  let relay: OutboxRelay;
  const orgId = `e2e-outbox-org-${Date.now()}`;
  const tenantAggregateId = `e2e-outbox-tenant-${Date.now()}`;

  const makeEvent = (): TenantRejectedEvent =>
    new TenantRejectedEvent({
      aggregateId: tenantAggregateId,
      correlationId: 'corr-e2e',
      payload: { actorId: 'op-e2e' },
    });

  beforeAll(async () => {
    await acquireRelayLock(); // 全文件作临界区：防并行 relay 窃取自属行的投递权
    scope = new TransactionScope();
    mikro = new MikroOrmService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never, scope);
    store = new MikroEventStore(mikro);
    uow = new MikroUnitOfWork(mikro, scope);
    published = [];
    relay = new OutboxRelay(
      { getEventPublishConfig: () => ({ mode: 'outbox', pollMs: 50 }) } as unknown as ConfigService,
      mikro,
      { publishAll: (batch: DomainEvent[]) => published.push(...batch) } as unknown as EventBus,
    );
  });

  afterAll(async () => {
    try {
      const em = await mikro.fork();
      await em.nativeDelete(Event, {
        aggregateType: 'tenant',
        aggregateId: tenantAggregateId,
      } as never);
      await em.nativeDelete(Organization, { id: orgId } as never);
      await (mikro as unknown as { onModuleDestroy(): Promise<void> }).onModuleDestroy();
    } finally {
      releaseRelayLock();
    }
  });

  it('同事务原子：事件 append 失败 → 同事务业务行一并回滚（dual-write 窗口消灭）', async () => {
    const first = makeEvent();
    // 先干净落一对（提交成功）
    await uow.run(async () => {
      await (await mikro.fork()).insert(Organization, {
        id: orgId,
        name: 'E2E Outbox',
        slug: orgId,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      await store.append([first]);
    });
    const probe = await mikro.fork();
    expect(await probe.count(Event, { eventId: first.eventId } as never)).toBe(1);

    // 再犯重复 eventId：事务内整段回滚——新 org 行不得存在
    const dupOrgId = `${orgId}-rollback`;
    await expect(
      uow.run(async () => {
        const em = await mikro.fork();
        await em.insert(Organization, {
          id: dupOrgId,
          name: 'E2E Outbox Rollback',
          slug: dupOrgId,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
        await store.append([makeEvent(), first]); // first 重复 → 唯一键 fail-loud
      }),
    ).rejects.toThrow();
    const after = await mikro.fork();
    expect(await after.count(Organization, { id: dupOrgId } as never)).toBe(0);
    // 原事件行未被污染（仍恰一行）
    expect(await after.count(Event, { eventId: first.eventId } as never)).toBe(1);
  });

  it('relay 投递：未派发行被 tickOnce 捞出并置 dispatchedAt，总线收到重建实例', async () => {
    const em0 = await mikro.fork();
    expect(
      await em0.count(Event, { dispatchedAt: null, aggregateId: tenantAggregateId } as never),
    ).toBe(1);
    expect(await relay.tickOnce()).toBeGreaterThanOrEqual(1);
    const lastId = await lastEventId(em0);
    expect(published.some((e) => e.eventId === lastId)).toBe(true);
    const em1 = await mikro.fork();
    const rows = await em1.find(Event, { aggregateId: tenantAggregateId } as never);
    expect(rows.every((r) => r.dispatchedAt != null)).toBe(true);
  });

  it('去重重投（at-least-once）：置位前崩溃再现未投递行 → 去重窗吞投递、只补标记', async () => {
    const em = await mikro.fork();
    const row = (await em.find(Event, { aggregateId: tenantAggregateId } as never))[0];
    // 模拟「已投递未置位即崩溃」：手工把 dispatchedAt 拨回 null
    await em.nativeUpdate(Event, { id: row.id } as never, { dispatchedAt: null } as never);
    // B1 scoped 观测（module-ci-gated-e2e-isolation·人裁）：全局 published.length 会被 tickOnce
    // 捞到的他人行注入污染（并发下属正常语义）；去重窗要锁的是「自属事件零新投 + 补标记」——
    // 按自有 aggregateId/eventId 钉死，与旁观者行免疫。
    const self = (e: DomainEvent) => e.aggregateId === tenantAggregateId;
    const before = published.filter(self).length;
    const rowHits = () => published.filter((e) => e.eventId === row.eventId).length;
    const rowHitsBefore = rowHits(); // case「relay 投递」已合法投过一次，历史残留在追加数组里
    await expect(relay.tickOnce()).resolves.toBeGreaterThanOrEqual(1);
    expect(published.filter(self).length).toBe(before); // 零新投（eventId 在去重窗内）
    expect(rowHits()).toBe(rowHitsBefore); // 本行未二次上总线
    const em2 = await mikro.fork();
    const after = await em2.findOne(Event, { id: row.id } as never);
    expect(after?.dispatchedAt).not.toBeNull();
  });

  it('版本拒收（裁点丁）：eventVersion 超上限行 → 行级 park 停重试、不停摆', async () => {
    const em = await mikro.fork();
    const poison = {
      eventId: `e2e-poison-${Date.now()}`,
      aggregateId: tenantAggregateId,
      aggregateType: 'tenant',
      version: 999,
      eventType: 'tenant.rejected',
      eventVersion: 99,
      payload: {},
      metadata: null,
      occurredAt: new Date(),
      createdAt: new Date(),
      attemptCount: 0,
      dispatchedAt: null,
      lastError: null,
    };
    await em.insert(Event, poison as never);
    await relay.tickOnce();
    const row = await em.findOne(Event, { eventId: poison.eventId } as never);
    expect(row?.dispatchedAt).toBeNull();
    expect(row?.attemptCount).toBe(OutboxRelay.MAX_ATTEMPTS);
    expect(row?.lastError).toBe('unsupported eventVersion 99');
    // 二次 tick 不再拉取（attemptCount<MAX 条件自然排除）：B1 scoped——只钉「poison 事件永不上总线」，
    // 不用全局长度（他人行被自有 relay 捞投属并发正常态）。
    expect(published.some((e) => (e as { eventId?: string }).eventId === poison.eventId)).toBe(
      false,
    );
    await relay.tickOnce();
    expect(published.some((e) => (e as { eventId?: string }).eventId === poison.eventId)).toBe(
      false,
    );
    await em.nativeDelete(Event, { eventId: poison.eventId } as never);
  });

  it('publisher outbox 守卫：事务外 publishAll fail-loud（同事务硬要求）', async () => {
    const config = { getEventPublishConfig: () => ({ mode: 'outbox', pollMs: 50 }) };
    const publisher = new DefaultDomainEventPublisher(
      { publishAll: () => {} } as unknown as EventBus,
      store,
      config as unknown as ConfigService,
      scope,
    );
    await expect(publisher.publishAll([makeEvent()])).rejects.toThrow(/unit of work/);
    // 注册表收录核对（防 e2e 与 registry 漂移）
    expect(EVENT_TYPE_REGISTRY.has('tenant.rejected')).toBe(true);
  });

  async function lastEventId(em: Awaited<ReturnType<MikroOrmService['fork']>>): Promise<string> {
    const rows = await em.find(Event, { aggregateId: tenantAggregateId } as never, {
      orderBy: { id: 'DESC' },
      limit: 1,
    });
    return rows[0]?.eventId ?? '';
  }
});

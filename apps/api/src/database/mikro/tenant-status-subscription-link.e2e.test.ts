import 'reflect-metadata';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@app/config/config.service';
import { Organization } from '@app/database/mikro/entities';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import type { EventBus } from '@nestjs/cqrs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MikroEventStore } from '../eventing/mikro-event-store';
import { MikroUnitOfWork } from '../eventing/mikro-unit-of-work';
import { OutboxRelay } from '../eventing/outbox-relay';
import { TransactionScope } from '../eventing/transaction-scope';
import { Event, TenantSubscription } from './four-tables';
import { MikroOrmService } from './mikro-orm.service';

/**
 * 治理联动消费者 **真库往返**（module-es-first-real-consumer 治理档 S3 · env-gated）。
 *
 * 装配三面一体的收口证据：outbox 事件行（治理卡点同事务 append）→ relay 投递（registry 以
 * **同一事件类**重建）→ 消费者经系统面真 SQL 收敛订阅行，并复验 at-least-once 重投幂等
 * （no-op·updatedAt 不动）与 UUIDv7 主键/信封 id 落库形态。
 *
 * 总线为分发替身（直调真实收敛逻辑）：类同一性（relay 重建类 === @EventsHandler 匹配类）已由
 * handler 单测锁死，本测不再经 Nest DI。dev 库可能存在他聚合的未投递残留行（relay 全表
 * `id ASC limit 50` 会先消化它们），故投递断言一律走「排空直到本行 dispatched」而非计数。
 * 仅 `E2E_DATABASE_URL` 存在且库已含投递列时运行。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

/**
 * B1 互斥锁（module-ci-gated-e2e-isolation·人 2026-10-17 裁 B1）：本文件 relay 为手动 tickOnce 全局
 * 捞行（生产语义·设计行为），与并行跑的 outbox-relay.e2e（其断言依赖「自属行由自属 relay 投递到
 * 自属总线」，跨进程 bus 互不可见）存在结构性窃取竞态。两文件共用的 O_EXCL 锁文件实现在
 * outbox-relay.e2e.test.ts 头注有完整背景；此处内联同款（test-only·免新增文件触构建收集面），
 * 仅围每轮 drain tick 短持，outbox 全文件为临界区。
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
          process.kill(owner, 0); // 存活 → 不抛；不存在 → ESRCH
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH')
          holderAlive = false; // stale → 夺回
        else if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          continue; // 锁刚释放 → 重试
        else throw error;
      }
      if (holderAlive) {
        if (Date.now() > deadline) throw new Error('relay e2e lock acquire timeout (30s)');
      } else {
        try {
          unlinkSync(RELAY_LOCK);
        } catch {
          /* 并发夺回已做 */
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
    /* 幂等 */
  }
}

gated('Tenant-status → subscription link real-DB round trip (治理档 S3 · env-gated)', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;
  let scope: TransactionScope;
  let uow: MikroUnitOfWork;
  let relay: OutboxRelay;
  const tenantId = uuidv7();
  const subId = uuidv7();

  const transitionEvent = (to: string) =>
    new TenantStatusTransitionedEvent({
      aggregateId: tenantId,
      payload: { from: null, to: to as never, actorId: 'op-link' },
    });

  // 真库回读一律 raw SQL：fork 继承的 ORM 缓存层会吐 stale 实体（实跑铁证：raw=suspended 而 findOne 回 active），
  // 本测验的是 DB 往返，断言必须以 DB 视角为准。
  type RawEm = { execute: (sql: string, params: unknown[]) => Promise<unknown> };
  async function raw(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    const em = (await mikro.fork()) as unknown as RawEm;
    return (await em.execute(sql, params)) as Record<string, unknown>[];
  }

  // 本仓 DDL 列名为 camelCase（需双引号标识符）。
  async function subRow(): Promise<{ status: string; updatedAtMs: number } | null> {
    const rows = await raw(
      'SELECT status, EXTRACT(EPOCH FROM "updatedAt") * 1000 AS ms FROM tenant_subscription WHERE id = ?',
      [subId],
    );
    const r = rows[0];
    return r ? { status: String(r.status), updatedAtMs: Number(r.ms) } : null;
  }

  async function isDispatched(eventId: string): Promise<boolean> {
    const rows = await raw(
      'SELECT "dispatchedAt" IS NOT NULL AS done FROM event WHERE "eventId" = ?',
      [eventId],
    );
    return rows[0]?.done === true;
  }

  /** 排空 relay 直至指定 eventId 的行已投递（残留行只延迟到达，不改变收敛结果）。本文件已持文件级锁，tick 不再重复围锁。 */
  async function drainUntilDispatched(eventId: string): Promise<void> {
    for (let i = 0; i < 10; i++) {
      if (await isDispatched(eventId)) return;
      await relay.tickOnce();
    }
    throw new Error(`event ${eventId} 未在 10 轮排空内被投递`);
  }

  /**
   * 等待异步收敛完成：relay 对 bus.publishAll 是 fire-and-forget（与真实 @nestjs/cqrs 同步入队、
   * handler 微任务执行的语义一致，outbox-relay.ts L137），故投递后须轮询订阅行至期望态而非即时断言。
   */
  async function waitStatus(
    expected: string,
  ): Promise<{ status: string; updatedAtMs: number } | null> {
    for (let i = 0; i < 50; i++) {
      const row = await subRow();
      if (row?.status === expected) return row;
      await new Promise((r) => setTimeout(r, 10));
    }
    return subRow();
  }

  beforeAll(async () => {
    // 文件级临界区（B1 锁·人裁）：与 outbox-relay.e2e 全生命周期串行——两文件共用一把锁后并行会互吞
    // 对方未派发行（tickOnce 全局捞行），被吞方面对自己的 bus 拿不到事件 → 消费者永不收敛；
    // 串行化保证「插行→自属 tick→投递」闭环内无对侧 relay 窥伺（其余 gated 文件的 app 启动循环已
    // override 节除，不参与竞态；其插入的旁观行不依赖投递权，历史全绿已证）。
    await acquireRelayLock();
    scope = new TransactionScope();
    mikro = new MikroOrmService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never, scope);
    store = new MikroEventStore(mikro);
    uow = new MikroUnitOfWork(mikro, scope);
    // 系统面收敛真 SQL（与 MikroSubscriptionLifecycle 同语义·fork 出 uow 作用域 → autocommit）
    const convergeStatus = async (tid: string, from: string, to: string) => {
      const em = await mikro.fork();
      const rows = await em.find(
        TenantSubscription,
        { tenantId: tid, status: from } as never,
        {
          orderBy: { periodStart: 'DESC', createdAt: 'DESC' },
          limit: 1,
        } as never,
      );
      const row = rows[0];
      if (!row) return false;
      await em.nativeUpdate(
        TenantSubscription,
        { id: row.id } as never,
        {
          status: to,
          updatedAt: new Date(),
        } as never,
      );
      return true;
    };
    relay = new OutboxRelay(
      // pollMs 拨大：禁后台 timer 与本测手动 tickOnce 竞态（outbox 模式下构造即启 timer）
      {
        getEventPublishConfig: () => ({ mode: 'outbox', pollMs: 600_000 }),
      } as unknown as ConfigService,
      mikro,
      {
        publishAll: (batch: DomainEvent[]) => {
          return Promise.all(
            batch.map((e) => {
              if (!(e instanceof TenantStatusTransitionedEvent)) return undefined;
              const to = e.payload.to;
              if (to === TENANT_STATUS.SUSPENDED) {
                return convergeStatus(
                  e.aggregateId,
                  SUBSCRIPTION_STATUS.ACTIVE,
                  SUBSCRIPTION_STATUS.SUSPENDED,
                );
              }
              if (to === TENANT_STATUS.ACTIVE) {
                return convergeStatus(
                  e.aggregateId,
                  SUBSCRIPTION_STATUS.SUSPENDED,
                  SUBSCRIPTION_STATUS.ACTIVE,
                );
              }
              return undefined;
            }),
          );
        },
      } as unknown as EventBus,
    );
    // 前置数据：org 行（FK 目标）+ 一条 active 订阅行（id 即 UUIDv7·本测顺带实证新形态落库）
    const em = await mikro.fork();
    await em.insert(Organization, {
      id: tenantId,
      name: `E2E Link Org ${tenantId}`,
      slug: `e2e-link-${tenantId}`,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    await em.insert(TenantSubscription, {
      id: subId,
      tenantId,
      plan: 'pro',
      status: SUBSCRIPTION_STATUS.ACTIVE,
      seatsLimit: 20,
      storageQuota: null,
      apiQuota: null,
      periodStart: new Date(),
      periodEnd: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  afterAll(async () => {
    try {
      const em = await mikro.fork();
      await em.nativeDelete(TenantSubscription, { id: subId } as never);
      await em.nativeDelete(Event, { aggregateType: 'tenant', aggregateId: tenantId } as never);
      await em.nativeDelete(Organization, { id: tenantId } as never);
      await (mikro as unknown as { onModuleDestroy(): Promise<void> }).onModuleDestroy();
    } finally {
      releaseRelayLock();
    }
  });

  it('suspend：outbox 行经 relay 投递 → 订阅行 active→suspended（真实 SQL 收敛）', async () => {
    const ev = transitionEvent(TENANT_STATUS.SUSPENDED);
    await uow.run(async () => {
      await store.append([ev]);
    });
    await drainUntilDispatched(ev.eventId);
    expect((await waitStatus(SUBSCRIPTION_STATUS.SUSPENDED))?.status).toBe(
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
  });

  it('at-least-once 重投幂等：dispatchedAt 拨回再投 → 收敛 no-op → 行仍 suspended 且 updatedAt 不动', async () => {
    const before = await subRow();
    const evRows = await raw(
      'SELECT id, "eventId" FROM event WHERE "aggregateId" = ? ORDER BY id',
      [tenantId],
    );
    const evRow = evRows[0] as { id: string; eventId: string };
    await raw('UPDATE event SET "dispatchedAt" = NULL WHERE id = ?', [evRow.id]);
    await drainUntilDispatched(evRow.eventId);
    await new Promise((r) => setTimeout(r, 120)); // 给重投窗口：若误翻会在此体现
    const after = await subRow();
    expect(after?.status).toBe(SUBSCRIPTION_STATUS.SUSPENDED);
    expect(after?.updatedAtMs).toBe(before?.updatedAtMs); // 零重复变更
  });

  it('resume：to=active 事件 → suspended 行回 active（可恢复语义闭环）', async () => {
    const ev = transitionEvent(TENANT_STATUS.ACTIVE);
    await uow.run(async () => {
      await store.append([ev]);
    });
    await drainUntilDispatched(ev.eventId);
    expect((await waitStatus(SUBSCRIPTION_STATUS.ACTIVE))?.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
  });

  it('UUIDv7 实证：订阅行 id 与事件信封 eventId 均为 v7 形态且时间戳高位可解码为近时刻', async () => {
    const evRows = await raw('SELECT "eventId" FROM event WHERE "aggregateId" = ? ORDER BY id', [
      tenantId,
    ]);
    const eventId = String((evRows[0] as { eventId: string }).eventId);
    for (const id of [subId, eventId]) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const ms = Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);
      expect(Math.abs(Date.now() - ms)).toBeLessThan(60_000);
    }
  });
});

import 'reflect-metadata';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { replayTenantLifecycle } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle-fold';
import { TenantStatusService } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.service';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { QueryOrder } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTenantStreams } from '../../database/eventing/bootstrap-tenant-streams';
import { Event } from '../../database/eventing/entities/event.entity';
import { MikroEventStore } from '../../database/eventing/mikro-event-store';
import { MikroUnitOfWork } from '../../database/eventing/mikro-unit-of-work';
import { TransactionScope } from '../../database/eventing/transaction-scope';
import { MikroOrmService } from '../../database/mikro/mikro-orm.service';
import { Organization } from './infrastructure/entities/ba-org.entities';
import { Tenant } from './infrastructure/entities/tenant.entity';
import { MikroTenantStatusStore } from './infrastructure/mikro-tenant-status.store';

/**
 * tenant「回放即真相」存量对拍 gated e2e（ES R1b · module-es-r1-replay-core §5 判据测段①
 * 「存量 bootstrap 对拍」常驻化 · env-gated 真库）。
 *
 * 坐实三件（真容器真库·Testcontainers ci_e2e）：
 *  1. **bootstrap 落流 + version 续位**：无流行快照=v1；shadow 期历史流（首事
 *     `from='pending_approval'`——无空态起点的存量形状）快照=max+1 续位不重排；
 *  2. **replay fold ⇄ 户籍行一致**（§2 目标态判据②的存量段）：经 `MikroEventStore.load`
 *     重建 + `replayTenantLifecycle` 最后快照重启语义（§3-R1b 裁②甲·覆盖此前一切）——
 *     历史前缀不报错、终态逐字段等表行；
 *  3. **幂等律**：重跑零新增，每流恰含 1 条 bootstrapped。
 *
 * 夹具经 `onlyIds` 收窄（并行 gated 文件同库互不干扰·沿 tenant-table 时间戳唯一键纪律）；
 * afterAll 清净（event/tenant/organization 三面）运行幂等。段②③④（治理动作后对拍/崩溃
 * 模拟/并发乐观锁）属 R1c 补全，本片不越界。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('tenant 回放即真相·存量 bootstrap 对拍（ES R1b · §5 判据段① · env-gated）', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;

  const stamp = Date.now();
  const freshOrgId = `r1b-fresh-${stamp}`;
  const legacyOrgId = `r1b-legacy-${stamp}`;

  async function readStream(aggregateId: string) {
    const em = await mikro.fork();
    return em.find(Event, { aggregateId } as never, { orderBy: { version: QueryOrder.ASC } });
  }

  beforeAll(async () => {
    mikro = new MikroOrmService(
      { getDatabaseConfig: () => ({ url: E2E_DB }) } as never,
      new TransactionScope(),
    );
    store = new MikroEventStore(mikro);

    const em = await mikro.fork();
    for (const [id, status] of [
      [freshOrgId, 'pending_approval'],
      [legacyOrgId, 'active'],
    ] as const) {
      await em.insert(Organization, {
        id,
        name: `r1b ${id}`,
        slug: `${id}-slug`,
        logo: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      await em.insert(Tenant, { id, status, createdAt: new Date() } as never);
    }

    // legacy 流：shadow 期真实形状——首事 from='pending_approval'（无空态起点·无快照）。
    await store.append([
      new TenantStatusTransitionedEvent({
        aggregateId: legacyOrgId,
        payload: { from: 'pending_approval', to: 'active', actorId: 'op-legacy' },
      }),
    ]);
  });

  afterAll(async () => {
    const em = await mikro.fork();
    const ids = [freshOrgId, legacyOrgId];
    await em.nativeDelete(Event, { aggregateId: { $in: ids } } as never);
    await em.nativeDelete(Tenant, { id: { $in: ids } } as never);
    await em.nativeDelete(Organization, { id: { $in: ids } } as never);
    await mikro.onModuleDestroy();
  });

  it('bootstrap 落流：无流行快照 v1；历史流 max+1 续位；replay fold == 户籍行（覆盖此前一切）', async () => {
    const em = await mikro.fork();
    const result = await bootstrapTenantStreams(em, { onlyIds: [freshOrgId, legacyOrgId] });
    expect(result).toEqual({ total: 2, created: 2, skipped: 0 });

    // 无流新行：bootstrapped 恰为 v1，回放=快照态=表行。
    const freshRows = await readStream(freshOrgId);
    expect(freshRows.map((row) => row.version)).toEqual([1]);
    expect(freshRows[0].eventType).toBe('tenant.bootstrapped');
    expect(freshRows[0].payload).toEqual({ status: 'pending_approval', actorId: 'bootstrap' });
    const freshState = replayTenantLifecycle(await store.load('tenant', freshOrgId));
    expect(freshState).toMatchObject({ status: 'pending_approval', purged: false });

    // 历史流：治理事件 v1 之后快照续位 v2（不重排历史）；最后快照重启——shadow 期前缀
    // （首事 from≠null）被覆盖不报错，fold 终态逐字段等表行。
    const legacyRows = await readStream(legacyOrgId);
    expect(legacyRows.map((row) => row.version)).toEqual([1, 2]);
    expect(legacyRows.map((row) => row.eventType)).toEqual([
      'tenant.status.transitioned',
      'tenant.bootstrapped',
    ]);
    const legacyState = replayTenantLifecycle(await store.load('tenant', legacyOrgId));
    expect(legacyState).toMatchObject({
      organizationId: legacyOrgId,
      status: 'active',
      purged: false,
    });
    expect(legacyState?.status).toBe(
      (await (await mikro.fork()).findOne(Tenant, { id: legacyOrgId } as never))?.status,
    );
  });

  it('幂等律：重跑零新增，每流恰含 1 条 bootstrapped（可安全重跑）', async () => {
    const em = await mikro.fork();
    const rerun = await bootstrapTenantStreams(em, { onlyIds: [freshOrgId, legacyOrgId] });
    expect(rerun).toEqual({ total: 2, created: 0, skipped: 2 });

    for (const id of [freshOrgId, legacyOrgId]) {
      const rows = await readStream(id);
      expect(rows.filter((row) => row.eventType === 'tenant.bootstrapped')).toHaveLength(1);
    }
    expect(await readStream(legacyOrgId)).toHaveLength(2);
  });
});

/**
 * tenant「回放即真相」**写切换** gated e2e（ES R1c · module-es-r1-replay-core §5 判据段②③④
 * ·env-gated 真库）。直接组装真实件（MikroEventStore + MikroTenantStatusStore + MikroUnitOfWork
 * 共享同一 TransactionScope）驱动 `TenantStatusService`（旋钮开），验证写路径三件 DB 级语义：
 *  ② 治理动作后 `replay fold == 投影行`逐字段对拍（append 先于投影·投影携 fold 结果）；
 *  ③ 崩溃模拟：append+投影后、事务未提交前抛错 → 整体回滚无半写（事件行与户籍行同生共死）；
 *  ④ 乐观锁护栏：stale `expectedVersion` → fail-loud 不追加/不覆盖（真相源写路径依赖的护栏）。
 *
 * 总线派发（publishDurable 的 inproc/shadow 同步投递 vs outbox relay 异步）属 `DefaultDomainEventPublisher`
 * 单测与 subscription-link e2e 面，本测以最小发布体直委托真 `store.append`（只校 DB 语义）。
 */
gated('tenant 回放即真相·写切换（ES R1c · §5 段②③④ · env-gated）', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;
  let uow: MikroUnitOfWork;
  let svc: TenantStatusService;

  const stamp = Date.now();
  const foldOrgId = `r1c-fold-${stamp}`;
  const crashOrgId = `r1c-crash-${stamp}`;
  const lockOrgId = `r1c-lock-${stamp}`;
  const ids = [foldOrgId, crashOrgId, lockOrgId];

  async function readStream(aggregateId: string) {
    const em = await mikro.fork();
    return em.find(Event, { aggregateId } as never, { orderBy: { version: QueryOrder.ASC } });
  }

  beforeAll(async () => {
    const scope = new TransactionScope();
    mikro = new MikroOrmService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never, scope);
    store = new MikroEventStore(mikro);
    const statusStore = new MikroTenantStatusStore(mikro);
    uow = new MikroUnitOfWork(mikro, scope);
    // 最小发布体：publishDurable 直委托真 store.append（带 expectedVersion 乐观锁）；publishAll 禁用。
    const publisher = {
      publishAll: async () => {
        throw new Error('truth-source 写路径不得走 publishAll');
      },
      publishDurable: (events: Parameters<EventStore['append']>[0], version: number) =>
        store.append(events, version),
    } as unknown as DomainEventPublisher;
    svc = new TenantStatusService(statusStore, publisher, uow, store, true);

    const em = await mikro.fork();
    for (const id of ids) {
      await em.insert(Organization, {
        id,
        name: `r1c ${id}`,
        slug: `${id}-slug`,
        logo: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      await em.insert(Tenant, { id, status: 'pending_approval', createdAt: new Date() } as never);
    }
    // 三面均先 bootstrap 成流（v1 快照 pending），令写切换在 contiguous 流上续位。
    await bootstrapTenantStreams(em, { onlyIds: ids });
  });

  afterAll(async () => {
    const em = await mikro.fork();
    await em.nativeDelete(Event, { aggregateId: { $in: ids } } as never);
    await em.nativeDelete(Tenant, { id: { $in: ids } } as never);
    await em.nativeDelete(Organization, { id: { $in: ids } } as never);
    await mikro.onModuleDestroy();
  });

  it('② 治理动作后 replay fold == 投影行（append 先于投影·投影携 fold 结果）', async () => {
    const result = await svc.transition(foldOrgId, 'active', { actorId: 'op-1' });
    expect(result).toMatchObject({ kind: 'ok', previous: 'pending_approval', status: 'active' });

    // 流续位：v1 快照 + v2 治理事件（from 承 fold 前置态）。
    const rows = await readStream(foldOrgId);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows.map((r) => r.eventType)).toEqual([
      'tenant.bootstrapped',
      'tenant.status.transitioned',
    ]);
    expect(rows[1].payload).toMatchObject({ from: 'pending_approval', to: 'active' });

    // 逐字段对拍：回放 fold 终态 == 投影表行 status。
    const state = replayTenantLifecycle(await store.load('tenant', foldOrgId));
    const tenantRow = await (await mikro.fork()).findOne(Tenant, { id: foldOrgId } as never);
    expect(state?.status).toBe(tenantRow?.status);
    expect(state?.organizationId).toBe(foldOrgId);
    expect(state?.purged).toBe(false);
  });

  it('③ 崩溃模拟：append+投影后事务未提交抛错 → 整体回滚无半写', async () => {
    await expect(
      uow.run(async () => {
        await svc.transition(crashOrgId, 'active'); // reentrant：复用外层事务
        throw new Error('crash after append');
      }),
    ).rejects.toThrow('crash after append');

    // 回滚后流仍只 v1（v2 append 未提交）；投影表行仍 pending（upsert 未提交）。
    const rows = await readStream(crashOrgId);
    expect(rows.map((r) => r.version)).toEqual([1]);
    const tenantRow = await (await mikro.fork()).findOne(Tenant, { id: crashOrgId } as never);
    expect(tenantRow?.status).toBe('pending_approval');
  });

  it('④ 乐观锁护栏：stale expectedVersion → fail-loud 不追加/不覆盖', async () => {
    // lockOrgId 流现 max=1（bootstrap v1）→ max+1=2；以 stale expectedVersion=1 append 必拒。
    const stale = new TenantStatusTransitionedEvent({
      aggregateId: lockOrgId,
      payload: { from: 'pending_approval', to: 'active' },
    });
    await expect(store.append([stale], 1)).rejects.toThrow(/expectedVersion|fail-loud/);
    // 护栏拦截：流长度不变（未追加、未覆盖）。
    expect((await readStream(lockOrgId)).map((r) => r.version)).toEqual([1]);
  });
});

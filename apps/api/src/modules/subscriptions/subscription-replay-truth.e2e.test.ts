import 'reflect-metadata';
import { SubscriptionCreatedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-created.event';
import { SubscriptionStatusTransitionedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-status-transitioned.event';
import { replaySubscriptionLifecycle } from '@core/saas-kit/modules/subscriptions/domain/subscription-lifecycle-fold';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { QueryOrder } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapSubscriptionStreams } from '../../database/eventing/bootstrap-subscription-streams';
import { Event } from '../../database/eventing/entities/event.entity';
import { MikroEventStore } from '../../database/eventing/mikro-event-store';
import { MikroUnitOfWork } from '../../database/eventing/mikro-unit-of-work';
import { TransactionScope } from '../../database/eventing/transaction-scope';
import { MikroOrmService } from '../../database/mikro/mikro-orm.service';
import { Organization } from '../tenants/infrastructure/entities/ba-org.entities';
import { TenantSubscription } from './infrastructure/entities/tenant-subscription.entity';
import { MikroSubscriptionLifecycle } from './infrastructure/mikro-subscription.lifecycle';

/**
 * subscription「回放即真相」存量对拍 gated e2e（ES R4b · module-es-r4-second-context-subscriptions §3-R4b
 * 「存量 bootstrap 对拍」常驻化 · env-gated 真库 · 沿 tenant-replay-truth 段①先例）。
 *
 * 坐实三件（真容器真库·Testcontainers ci_e2e·镜像 R1b）：
 *  1. **bootstrap 落流 + version 续位**：无流行快照=v1；历史流（已有 `subscription.created` 起点）
 *     快照=max+1 续位不重排；
 *  2. **replay fold ⇄ 订阅行一致**（§2 目标态判据②的存量段）：经 `MikroEventStore.load` 重建 +
 *     `replaySubscriptionLifecycle` 最后快照重启语义（覆盖此前一切·历史前缀不报错·终态等表行）；
 *  3. **幂等律**：重跑零新增，每流恰含 1 条 bootstrapped。
 *
 * 夹具经 `onlyIds` 收窄（并行 gated 文件同库互不干扰·时间戳唯一键）；afterAll 清净（event/
 * tenant_subscription/organization 三面）运行幂等。写切换/乐观锁段（②③④）见下方 R4c 独立 describe。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('subscription 回放即真相·存量 bootstrap 对拍（ES R4b · §3-R4b 段① · env-gated）', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;

  const stamp = Date.now();
  const freshId = `r4b-fresh-${stamp}`;
  const legacyId = `r4b-legacy-${stamp}`;
  const orgId = `r4b-org-${stamp}`;

  async function readStream(aggregateId: string) {
    const em = await mikro.fork();
    return em.find(Event, { aggregateType: 'subscription', aggregateId } as never, {
      orderBy: { version: QueryOrder.ASC },
    });
  }

  beforeAll(async () => {
    mikro = new MikroOrmService(
      { getDatabaseConfig: () => ({ url: E2E_DB }) } as never,
      new TransactionScope(),
    );
    store = new MikroEventStore(mikro);

    const em = await mikro.fork();
    await em.insert(Organization, {
      id: orgId,
      name: `r4b org ${stamp}`,
      slug: `${orgId}-slug`,
      logo: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: null,
    } as never);

    // fresh：无流新行（表列 status=suspended·终态由快照裁决）。legacy：已有 created 起点（active）。
    for (const [id, status] of [
      [freshId, 'suspended'],
      [legacyId, 'cancelled'],
    ] as const) {
      await em.insert(TenantSubscription, {
        id,
        tenantId: orgId,
        plan: 'pro',
        status,
        seatsLimit: 5,
        periodStart: new Date(),
        updatedAt: new Date(),
      } as never);
    }

    // legacy 流历史前缀：真实创建形状（created=流起点·payload.status=active）。
    await store.append([
      new SubscriptionCreatedEvent({
        aggregateId: legacyId,
        payload: { plan: 'pro', status: 'active', actorId: 'op-legacy' },
      }),
    ]);
  });

  afterAll(async () => {
    const em = await mikro.fork();
    const ids = [freshId, legacyId];
    await em.nativeDelete(Event, {
      aggregateType: 'subscription',
      aggregateId: { $in: ids },
    } as never);
    await em.nativeDelete(TenantSubscription, { id: { $in: ids } } as never);
    await em.nativeDelete(Organization, { id: orgId } as never);
    await mikro.onModuleDestroy();
  });

  it('bootstrap 落流：无流行快照 v1；历史流 max+1 续位；replay fold == 订阅行（覆盖此前一切）', async () => {
    const em = await mikro.fork();
    const result = await bootstrapSubscriptionStreams(em, { onlyIds: [freshId, legacyId] });
    expect(result).toEqual({ total: 2, created: 2, skipped: 0 });

    // 无流新行：bootstrapped 恰 v1，回放=快照态=表行。
    const freshRows = await readStream(freshId);
    expect(freshRows.map((row) => row.version)).toEqual([1]);
    expect(freshRows[0].eventType).toBe('subscription.bootstrapped');
    const freshState = replaySubscriptionLifecycle(await store.load('subscription', freshId));
    expect(freshState).toMatchObject({ subscriptionId: freshId, status: 'suspended', version: 1 });

    // 历史流：created 起点 v1 之后快照续位 v2（不重排历史）；最后快照重启——created 前缀被覆盖
    // 不报错，fold 终态等表行 status。
    const legacyRows = await readStream(legacyId);
    expect(legacyRows.map((row) => row.version)).toEqual([1, 2]);
    expect(legacyRows.map((row) => row.eventType)).toEqual([
      'subscription.created',
      'subscription.bootstrapped',
    ]);
    const legacyState = replaySubscriptionLifecycle(await store.load('subscription', legacyId));
    expect(legacyState).toMatchObject({ subscriptionId: legacyId, status: 'cancelled' });
    expect(legacyState?.status).toBe(
      (await (await mikro.fork()).findOne(TenantSubscription, { id: legacyId } as never))?.status,
    );
  });

  it('幂等律：重跑零新增，每流恰含 1 条 bootstrapped（可安全重跑）', async () => {
    const em = await mikro.fork();
    const rerun = await bootstrapSubscriptionStreams(em, { onlyIds: [freshId, legacyId] });
    expect(rerun).toEqual({ total: 2, created: 0, skipped: 2 });

    for (const id of [freshId, legacyId]) {
      const rows = await readStream(id);
      expect(rows.filter((row) => row.eventType === 'subscription.bootstrapped')).toHaveLength(1);
    }
    expect(await readStream(legacyId)).toHaveLength(2);
  });
});

/**
 * subscription「回放即真相」**写切换** gated e2e（ES R4c · module-es-r4-second-context-subscriptions
 * §3-R4c 段②③④ · env-gated 真库 · 沿 tenant-replay-truth R1c 先例）。直接组装真实件（MikroEventStore +
 * MikroSubscriptionLifecycle + MikroUnitOfWork 共享同一 TransactionScope）驱动 `convergeStatus`（旋钮开 true），
 * 验证写路径三件 DB 级语义：
 *  ② 治理动作后 `replay fold == 投影行`逐字段对拍（append 先于投影·投影携 fold 结果）；
 *  ③ 崩溃模拟：append+投影后、事务未提交前抛错 → 整体回滚无半写（事件行与订阅投影行同生共死）；
 *  ④ 乐观锁护栏：stale `expectedVersion` → fail-loud 不追加/不覆盖。
 *
 * 总线派发（publishDurable 的同步/异步通道）属 `DefaultDomainEventPublisher` 单测面，本测以最小发布体
 * 直委托真 `store.append`（只校 DB 语义）。`convergeStatus` 按 tenantId 选最新 `from` 态行（一租户一行足够）。
 */
gated('subscription 回放即真相·写切换（ES R4c · §3-R4c 段②③④ · env-gated）', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;
  let uow: MikroUnitOfWork;
  let lifecycle: MikroSubscriptionLifecycle;

  const stamp = Date.now();
  const foldOrg = `r4c-fold-org-${stamp}`;
  const crashOrg = `r4c-crash-org-${stamp}`;
  const lockOrg = `r4c-lock-org-${stamp}`;
  const foldSub = `r4c-fold-sub-${stamp}`;
  const crashSub = `r4c-crash-sub-${stamp}`;
  const lockSub = `r4c-lock-sub-${stamp}`;
  const orgIds = [foldOrg, crashOrg, lockOrg];
  const subIds = [foldSub, crashSub, lockSub];

  async function readStream(aggregateId: string) {
    const em = await mikro.fork();
    return em.find(Event, { aggregateType: 'subscription', aggregateId } as never, {
      orderBy: { version: QueryOrder.ASC },
    });
  }

  beforeAll(async () => {
    const scope = new TransactionScope();
    mikro = new MikroOrmService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never, scope);
    store = new MikroEventStore(mikro);
    uow = new MikroUnitOfWork(mikro, scope);
    // 最小发布体：publishDurable 直委托真 store.append（带 expectedVersion 乐观锁）；publishAll 禁用。
    const publisher = {
      publishAll: async () => {
        throw new Error('truth-source 写路径不得走 publishAll');
      },
      publishDurable: (events: Parameters<EventStore['append']>[0], version: number) =>
        store.append(events, version),
    } as unknown as DomainEventPublisher;
    lifecycle = new MikroSubscriptionLifecycle(mikro, publisher, uow, store, true);

    const em = await mikro.fork();
    for (const [orgId, subId] of [
      [foldOrg, foldSub],
      [crashOrg, crashSub],
      [lockOrg, lockSub],
    ] as const) {
      await em.insert(Organization, {
        id: orgId,
        name: `r4c ${orgId}`,
        slug: `${orgId}-slug`,
        logo: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      // 起态 active（真相源下先经 bootstrap 成 v1 快照，写切换在 contiguous 流上续位）。
      await em.insert(TenantSubscription, {
        id: subId,
        tenantId: orgId,
        plan: 'pro',
        status: 'active',
        seatsLimit: 5,
        periodStart: new Date(),
        updatedAt: new Date(),
      } as never);
    }
    await bootstrapSubscriptionStreams(em, { onlyIds: subIds });
  });

  afterAll(async () => {
    const em = await mikro.fork();
    await em.nativeDelete(Event, {
      aggregateType: 'subscription',
      aggregateId: { $in: subIds },
    } as never);
    await em.nativeDelete(TenantSubscription, { id: { $in: subIds } } as never);
    await em.nativeDelete(Organization, { id: { $in: orgIds } } as never);
    await mikro.onModuleDestroy();
  });

  it('② 治理动作后 replay fold == 投影行（append 先于投影·投影携 fold 结果）', async () => {
    const changed = await lifecycle.convergeStatus(foldOrg, 'active', 'suspended');
    expect(changed).toBe(true);

    // 流续位：v1 快照 + v2 治理事件（from 承 fold 前置态）。
    const rows = await readStream(foldSub);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows.map((r) => r.eventType)).toEqual([
      'subscription.bootstrapped',
      'subscription.status.transitioned',
    ]);
    expect(rows[1].payload).toMatchObject({ from: 'active', to: 'suspended' });

    // 逐字段对拍：回放 fold 终态 == 投影表行 status。
    const state = replaySubscriptionLifecycle(await store.load('subscription', foldSub));
    const subRow = await (await mikro.fork()).findOne(TenantSubscription, {
      id: foldSub,
    } as never);
    expect(state?.status).toBe('suspended');
    expect(state?.status).toBe(subRow?.status);
    expect(state?.subscriptionId).toBe(foldSub);
  });

  it('③ 崩溃模拟：append+投影后事务未提交抛错 → 整体回滚无半写', async () => {
    await expect(
      uow.run(async () => {
        await lifecycle.convergeStatus(crashOrg, 'active', 'suspended'); // reentrant：复用外层事务
        throw new Error('crash after append');
      }),
    ).rejects.toThrow('crash after append');

    // 回滚后流仍只 v1（v2 append 未提交）；投影行仍 active（upsert 未提交）。
    const rows = await readStream(crashSub);
    expect(rows.map((r) => r.version)).toEqual([1]);
    const subRow = await (await mikro.fork()).findOne(TenantSubscription, {
      id: crashSub,
    } as never);
    expect(subRow?.status).toBe('active');
  });

  it('④ 乐观锁护栏：stale expectedVersion → fail-loud 不追加/不覆盖', async () => {
    // lockSub 流现 max=1（bootstrap v1）→ max+1=2；以 stale expectedVersion=1 append 必拒。
    const stale = new SubscriptionStatusTransitionedEvent({
      aggregateId: lockSub,
      payload: { from: 'active', to: 'suspended' },
    });
    await expect(store.append([stale], 1)).rejects.toThrow(/expectedVersion|fail-loud/);
    expect((await readStream(lockSub)).map((r) => r.version)).toEqual([1]);
  });
});

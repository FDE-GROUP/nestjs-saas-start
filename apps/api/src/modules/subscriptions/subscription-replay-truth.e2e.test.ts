import 'reflect-metadata';
import { SubscriptionCreatedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-created.event';
import { replaySubscriptionLifecycle } from '@core/saas-kit/modules/subscriptions/domain/subscription-lifecycle-fold';
import { QueryOrder } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapSubscriptionStreams } from '../../database/eventing/bootstrap-subscription-streams';
import { Event } from '../../database/eventing/entities/event.entity';
import { MikroEventStore } from '../../database/eventing/mikro-event-store';
import { TransactionScope } from '../../database/eventing/transaction-scope';
import { MikroOrmService } from '../../database/mikro/mikro-orm.service';
import { Organization } from '../tenants/infrastructure/entities/ba-org.entities';
import { TenantSubscription } from './infrastructure/entities/tenant-subscription.entity';

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
 * tenant_subscription/organization 三面）运行幂等。写切换/乐观锁段属 R4c，本片不越界。
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

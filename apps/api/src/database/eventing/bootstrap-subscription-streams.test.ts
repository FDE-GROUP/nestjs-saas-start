import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantSubscription } from '../../modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { bootstrapSubscriptionStreams } from './bootstrap-subscription-streams';

/**
 * subscription 存量成流 bootstrap 镜测（ES R4b · module-es-r4-second-context-subscriptions §3-R4b · DB-free）。
 * 沿 `bootstrapTenantStreams` 镜测先例：fake em 直调核心，锁案文律——
 * **幂等判重 / version 从流 max+1 续位 / zod 律（非法 status 拒入流·无 PII）/ onlyIds 收窄**。
 * 真库对拍归 R4b gated e2e（沿 tenant-replay-truth 段①）。
 */

interface FakeRow {
  id: string;
  status: string;
  plan: string;
}

interface FakeEventRow {
  aggregateType: string;
  aggregateId: string;
  version: number;
  eventType: string;
  payload: Record<string, unknown>;
}

function makeFakeEm(subs: FakeRow[], events: FakeEventRow[]) {
  const inserts: FakeEventRow[] = [];
  const find = vi.fn(
    async (entity: unknown, filter: Record<string, unknown>, options?: Record<string, unknown>) => {
      if (entity === TenantSubscription) {
        const idFilter = filter.id as { $in?: string[] } | undefined;
        return idFilter?.$in ? subs.filter((s) => idFilter.$in?.includes(s.id)) : [...subs];
      }
      // Event 流查询：按 aggregateId（+可选 eventType）过滤，模拟 version 排序/limit。
      let rows = events
        .concat(inserts)
        .filter((e) => e.aggregateId === filter.aggregateId)
        .filter(
          (e) => filter.eventType === undefined || e.eventType === (filter.eventType as string),
        );
      if ((options?.orderBy as Record<string, string>)?.version === 'DESC') {
        rows = [...rows].sort((a, b) => b.version - a.version);
      }
      if (typeof options?.limit === 'number') {
        rows = rows.slice(0, options.limit);
      }
      return rows;
    },
  );
  const insert = vi.fn(async (_entity: unknown, data: FakeEventRow) => {
    inserts.push(data);
  });
  const em = { find, insert } as unknown as EntityManager;
  return { em, inserts };
}

const BOOTSTRAP = 'subscription.bootstrapped';

describe('bootstrapSubscriptionStreams（ES R4b 核心·镜测）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('空表 → total=0 零写', async () => {
    const { em, inserts } = makeFakeEm([], []);
    await expect(bootstrapSubscriptionStreams(em)).resolves.toEqual({
      total: 0,
      created: 0,
      skipped: 0,
    });
    expect(inserts).toHaveLength(0);
  });

  it('无流新行 → 快照落 version 1；payload=zod 形（status + plan + actorId=bootstrap 审计留痕）', async () => {
    const { em, inserts } = makeFakeEm([{ id: 'subA', status: 'active', plan: 'pro' }], []);
    const result = await bootstrapSubscriptionStreams(em);
    expect(result).toEqual({ total: 1, created: 1, skipped: 0 });
    expect(inserts[0]).toMatchObject({
      aggregateType: 'subscription',
      aggregateId: 'subA',
      version: 1,
      eventType: BOOTSTRAP,
      payload: { status: 'active', plan: 'pro', actorId: 'bootstrap' },
    });
    // PII 边界：payload 不含 tenantId/seatsLimit/provider 等列
    expect(inserts[0].payload).not.toHaveProperty('tenantId');
    expect(inserts[0].payload).not.toHaveProperty('seatsLimit');
  });

  it('version 续位：既有 2 条治理事件 → 快照落 max+1=3（不重排历史）', async () => {
    const { em, inserts } = makeFakeEm(
      [{ id: 'subB', status: 'active', plan: 'basic' }],
      [
        {
          aggregateType: 'subscription',
          aggregateId: 'subB',
          version: 1,
          eventType: 'subscription.created',
          payload: { plan: 'basic', status: 'active' },
        },
        {
          aggregateType: 'subscription',
          aggregateId: 'subB',
          version: 2,
          eventType: 'subscription.status.transitioned',
          payload: { from: 'active', to: 'suspended' },
        },
      ],
    );
    // 订阅行 status 与流终态一致性由 --verify/gated 对拍管；镜测只锁续位。
    await bootstrapSubscriptionStreams(em, { onlyIds: ['subB'] });
    expect(inserts[0].version).toBe(3);
    expect(inserts[0].eventType).toBe(BOOTSTRAP);
  });

  it('幂等律：流内已含 bootstrapped → 跳过零写（可安全重跑）', async () => {
    const events: FakeEventRow[] = [
      {
        aggregateType: 'subscription',
        aggregateId: 'subC',
        version: 1,
        eventType: BOOTSTRAP,
        payload: { status: 'cancelled', plan: 'pro', actorId: 'bootstrap' },
      },
    ];
    const { em, inserts } = makeFakeEm([{ id: 'subC', status: 'cancelled', plan: 'pro' }], events);
    await expect(bootstrapSubscriptionStreams(em)).resolves.toEqual({
      total: 1,
      created: 0,
      skipped: 1,
    });
    expect(inserts).toHaveLength(0);
  });

  it('zod 律：订阅行 status 越出契约 enum → parse fail-loud，整行不写', async () => {
    const { em, inserts } = makeFakeEm([{ id: 'subD', status: 'not_a_status', plan: 'pro' }], []);
    await expect(bootstrapSubscriptionStreams(em)).rejects.toThrowError();
    expect(inserts).toHaveLength(0);
  });

  it('onlyIds 收窄：清单外行不触（夹具隔离语义·gated e2e 依赖）', async () => {
    const { em, inserts } = makeFakeEm(
      [
        { id: 'subE', status: 'active', plan: 'pro' },
        { id: 'subF', status: 'expired', plan: 'basic' },
      ],
      [],
    );
    const result = await bootstrapSubscriptionStreams(em, { onlyIds: ['subF'] });
    expect(result).toEqual({ total: 1, created: 1, skipped: 0 });
    expect(inserts.map((row) => row.aggregateId)).toEqual(['subF']);
  });
});

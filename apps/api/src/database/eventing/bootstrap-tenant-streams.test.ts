import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tenant } from '../../modules/tenants/infrastructure/entities/tenant.entity';
import { bootstrapTenantStreams } from './bootstrap-tenant-streams';

/**
 * tenant 存量成流 bootstrap 镜测（ES R1b · module-es-r1-replay-core §3-R1b · DB-free）。
 * 沿 `runSeed(em, options)` 可注入先例：fake em 直调核心，锁三条案文律——
 * **幂等判重 / version 从流 max+1 续位 / zod 律（非法 payload 拒入流）**，
 * 及 `onlyIds` 收窄（gated e2e 夹具隔离依赖此语义）。真库对拍归 tenant-replay-truth gated e2e。
 */

interface FakeRow {
  id: string;
  status: string;
}

interface FakeEventRow {
  aggregateType: string;
  aggregateId: string;
  version: number;
  eventType: string;
  payload: Record<string, unknown>;
}

function makeFakeEm(tenants: FakeRow[], events: FakeEventRow[]) {
  const inserts: FakeEventRow[] = [];
  const find = vi.fn(
    async (entity: unknown, filter: Record<string, unknown>, options?: Record<string, unknown>) => {
      if (entity === Tenant) {
        const idFilter = filter.id as { $in?: string[] } | undefined;
        return idFilter?.$in ? tenants.filter((t) => idFilter.$in?.includes(t.id)) : [...tenants];
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

const BOOTSTRAP = 'tenant.bootstrapped';

describe('bootstrapTenantStreams（ES R1b 核心·镜测）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('空表 → total=0 零写', async () => {
    const { em, inserts } = makeFakeEm([], []);
    await expect(bootstrapTenantStreams(em)).resolves.toEqual({
      total: 0,
      created: 0,
      skipped: 0,
    });
    expect(inserts).toHaveLength(0);
  });

  it('无流新行 → 快照落 version 1；payload=zod 形（status + actorId=bootstrap 审计留痕）', async () => {
    const { em, inserts } = makeFakeEm([{ id: 'orgA', status: 'pending_approval' }], []);
    const result = await bootstrapTenantStreams(em);
    expect(result).toEqual({ total: 1, created: 1, skipped: 0 });
    expect(inserts[0]).toMatchObject({
      aggregateType: 'tenant',
      aggregateId: 'orgA',
      version: 1,
      eventType: BOOTSTRAP,
      payload: { status: 'pending_approval', actorId: 'bootstrap' },
    });
    expect(inserts[0].payload).not.toHaveProperty('name');
    expect(inserts[0].payload).not.toHaveProperty('slug');
  });

  it('version 续位：既有 2 条治理事件 → 快照落 max+1=3（不重排历史）', async () => {
    const { em, inserts } = makeFakeEm(
      [{ id: 'orgB', status: 'active' }],
      [
        {
          aggregateType: 'tenant',
          aggregateId: 'orgB',
          version: 1,
          eventType: 'tenant.status.transitioned',
          payload: { from: 'pending_approval', to: 'active' },
        },
        {
          aggregateType: 'tenant',
          aggregateId: 'orgB',
          version: 2,
          eventType: 'tenant.status.transitioned',
          payload: { from: 'active', to: 'suspended' },
        },
      ],
    );
    // 户籍行 status 与流终态一致性由 --verify/gated 对拍管；镜测只锁续位。
    await bootstrapTenantStreams(em, { onlyIds: ['orgB'] });
    expect(inserts[0].version).toBe(3);
    expect(inserts[0].eventType).toBe(BOOTSTRAP);
  });

  it('幂等律：流内已含 bootstrapped → 跳过零写（可安全重跑）', async () => {
    const events: FakeEventRow[] = [
      {
        aggregateType: 'tenant',
        aggregateId: 'orgC',
        version: 1,
        eventType: BOOTSTRAP,
        payload: { status: 'suspended', actorId: 'bootstrap' },
      },
    ];
    const { em, inserts } = makeFakeEm([{ id: 'orgC', status: 'suspended' }], events);
    await expect(bootstrapTenantStreams(em)).resolves.toEqual({
      total: 1,
      created: 0,
      skipped: 1,
    });
    expect(inserts).toHaveLength(0);
  });

  it('zod 律：户籍行 status 越出契约 enum → parse fail-loud，整行不写', async () => {
    const { em, inserts } = makeFakeEm([{ id: 'orgD', status: 'not_a_status' }], []);
    await expect(bootstrapTenantStreams(em)).rejects.toThrowError();
    expect(inserts).toHaveLength(0);
  });

  it('onlyIds 收窄：清单外行不触（夹具隔离语义·gated e2e 依赖）', async () => {
    const { em, inserts } = makeFakeEm(
      [
        { id: 'orgE', status: 'active' },
        { id: 'orgF', status: 'pending_approval' },
      ],
      [],
    );
    const result = await bootstrapTenantStreams(em, { onlyIds: ['orgF'] });
    expect(result).toEqual({ total: 1, created: 1, skipped: 0 });
    expect(inserts.map((row) => row.aggregateId)).toEqual(['orgF']);
  });
});

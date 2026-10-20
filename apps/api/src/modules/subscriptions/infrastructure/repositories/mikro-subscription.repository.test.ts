import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroSubscriptionRepository } from './mikro-subscription.repository';

/**
 * 切片 3c-ii-A 双轨**镜像断言**：与 `原订阅仓储镜像测试` 同一套隔离律（S7 · FR-5），
 * 谓词对象换为 Mikro `FilterQuery`。关键不变量：`requireTenantId()` fail-closed **先于** `fork()`。
 */
function makeRepo(tenantId: string | null) {
  const requireTenantId = vi.fn(() => {
    if (!tenantId) throw new ForbiddenException('Missing active tenant context');
    return tenantId;
  });
  const tenant = { requireTenantId } as unknown as TenantContextService;

  const find = vi.fn().mockResolvedValue([]);
  const create = vi.fn((_entity: unknown, data: Record<string, unknown>) => data);
  const flush = vi.fn().mockResolvedValue(undefined);
  const persist = vi.fn(() => ({ flush }));
  const em = { find, create, persist, flush } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;

  return {
    repo: new MikroSubscriptionRepository(mikro, tenant),
    spies: { requireTenantId, fork, find, create, persist, flush },
  };
}

describe('MikroSubscriptionRepository · tenant isolation (S7 · FR-5 choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: create/history refuse and never fork when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.create({ plan: 'pro', seatsLimit: 20 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(repo.history()).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.fork).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.find).not.toHaveBeenCalled();
  });

  it('create() stamps the ALS tenant + forces status=active (1:N history append)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create({ plan: 'pro', seatsLimit: 20, providerCustomerId: 'cus_1' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data).toMatchObject({
      tenantId: 'orgA',
      status: 'active',
      plan: 'pro',
      seatsLimit: 20,
      providerCustomerId: 'cus_1',
      provider: null,
    });
    // regression: `updatedAt`/`createdAt` NOT NULL w/ no DB default — insert must stamp them
    expect(data.updatedAt).toBeInstanceOf(Date);
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(spies.persist).toHaveBeenCalled();
    expect(spies.flush).toHaveBeenCalled();
  });

  it('history() ALWAYS filters by the active tenant, ordered by periodStart DESC (red if dropped)', async () => {
    const { repo, spies } = makeRepo('orgA');
    const periodStart = new Date('2026-01-01T00:00:00.000Z');
    const periodEnd = new Date('2026-02-01T00:00:00.000Z');
    const createdAt = periodStart;
    const updatedAt = periodEnd;
    spies.find.mockResolvedValueOnce([
      {
        id: 'sub1',
        tenantId: 'orgA',
        plan: 'pro',
        status: 'active',
        seatsLimit: 20,
        storageQuota: null,
        apiQuota: null,
        periodStart,
        periodEnd,
        provider: null,
        providerCustomerId: null,
        providerSubscriptionId: null,
        createdAt,
        updatedAt,
      },
    ]);
    const rows = await repo.history();
    const [entity, where, options] = spies.find.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(TenantSubscription);
    expect(where).toEqual({ tenantId: 'orgA' });
    expect(options).toMatchObject({ orderBy: { periodStart: QueryOrder.DESC } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'sub1', tenantId: 'orgA', plan: 'pro', status: 'active' });
  });
});

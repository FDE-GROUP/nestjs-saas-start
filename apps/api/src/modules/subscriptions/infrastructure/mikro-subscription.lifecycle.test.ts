import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { SubscriptionBootstrappedEvent } from '@core/saas-kit/modules/subscriptions/domain/events/subscription-bootstrapped.event';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import type { UnitOfWork } from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroSubscriptionLifecycle } from './mikro-subscription.lifecycle';

/**
 * `MikroSubscriptionLifecycle` 单测（治理档 S2）：终态收敛的 SQL 面语义走 mock em——
 * 有 `from` 行只更新最新一条、无 `from` 行零写返 `false`（幂等的物理支点后半；真库往返由
 * env-gated e2e 承担·S3）。
 */

function makeLifecycle(rows: Array<{ id: string }>) {
  const nativeUpdate = vi.fn(async () => ({ affectedRows: 1 }));
  const find = vi.fn(async () => rows);
  const em = { find, nativeUpdate };
  const mikro = { fork: async () => em };
  const lifecycle = new MikroSubscriptionLifecycle(mikro as unknown as MikroOrmService);
  return { lifecycle, find, nativeUpdate };
}

describe('MikroSubscriptionLifecycle（系统面·终态收敛）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('存在 from 态行：只收敛最新一条（limit 1·显式 tenantId+status 谓词·盖 updatedAt）', async () => {
    const { lifecycle, find, nativeUpdate } = makeLifecycle([{ id: 'sub-1' }]);
    const changed = await lifecycle.convergeStatus(
      'org-9',
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
    expect(changed).toBe(true);
    expect(find).toHaveBeenCalledWith(
      TenantSubscription,
      { tenantId: 'org-9', status: SUBSCRIPTION_STATUS.ACTIVE },
      expect.objectContaining({ limit: 1 }),
    );
    expect(nativeUpdate).toHaveBeenCalledWith(
      TenantSubscription,
      { id: 'sub-1' },
      expect.objectContaining({
        status: SUBSCRIPTION_STATUS.SUSPENDED,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('无 from 行（重投/乱序滞后）：零写返 false——幂等 no-op 的物理兑现', async () => {
    const { lifecycle, nativeUpdate } = makeLifecycle([]);
    const changed = await lifecycle.convergeStatus(
      'org-9',
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
    expect(changed).toBe(false);
    expect(nativeUpdate).not.toHaveBeenCalled();
  });
});

/**
 * ES R4c 真相源写切换镜测（module-es-r4-second-context-subscriptions §3-R4c·沿 R1c
 * `tenant-status.service.test` 先例）：旋钮开时 `convergeStatus` 以 fold 重放态为裁决输入、
 * 走 `publishDurable`（带 expectedVersion 乐观锁）+ 投影 nativeUpdate(fold 结果)，
 * **不调 publishAll**；`rebuildProjection` 单流重建。DB-free（真库往返由 gated 段②③④承担）。
 */
function makeTruthLifecycle(opts: { row?: { id: string }; stream: DomainEvent[] }) {
  const nativeUpdate = vi.fn(async () => ({ affectedRows: 1 }));
  const find = vi.fn(async () => (opts.row ? [opts.row] : []));
  const em = { find, nativeUpdate };
  const mikro = { fork: async () => em };
  const durable: Array<{ events: readonly DomainEvent[]; version: number }> = [];
  const publisher = {
    publishAll: vi.fn(async () => {
      throw new Error('truth-source 路径不得调 publishAll（会二次 append）');
    }),
    publishDurable: vi.fn(async (events: readonly DomainEvent[], version: number) => {
      durable.push({ events, version });
    }),
  } as unknown as DomainEventPublisher;
  const eventStore = { load: vi.fn(async () => opts.stream) } as unknown as EventStore;
  const uow = { run: <T>(fn: () => Promise<T>) => fn() } as unknown as UnitOfWork;
  const lifecycle = new MikroSubscriptionLifecycle(
    mikro as unknown as MikroOrmService,
    publisher,
    uow,
    eventStore,
    true,
  );
  return { lifecycle, nativeUpdate, find, durable, eventStore, publisher };
}

const bootstrapped = (id: string, status: 'active' | 'suspended' | 'expired' | 'cancelled') =>
  new SubscriptionBootstrappedEvent({ aggregateId: id, payload: { status, actorId: 'bootstrap' } });

describe('MikroSubscriptionLifecycle.convergeStatus 真相源写切换（ES R4c · 旋钮开）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('以 fold 前置态裁决 + publishDurable(expectedVersion=流长+1) + 投影 upsert(fold 结果)', async () => {
    const { lifecycle, nativeUpdate, durable } = makeTruthLifecycle({
      row: { id: 'sub-1' },
      stream: [bootstrapped('sub-1', 'active')],
    });
    const changed = await lifecycle.convergeStatus(
      'org-9',
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
    expect(changed).toBe(true);
    // 流长 1 ⇒ expectedVersion 2（与 store.append 内部 max+1 同律）。
    expect(durable).toHaveLength(1);
    expect(durable[0].version).toBe(2);
    expect(durable[0].events[0]).toMatchObject({
      eventType: 'subscription.status.transitioned',
      aggregateId: 'sub-1',
      payload: { from: 'active', to: 'suspended', actorId: 'tenant-link' },
    });
    // 投影 = fold 结果（非手推 to）。
    expect(nativeUpdate).toHaveBeenCalledWith(
      TenantSubscription,
      { id: 'sub-1' },
      expect.objectContaining({ status: SUBSCRIPTION_STATUS.SUSPENDED }),
    );
  });

  it('fold 终态不可迁移（cancelled → active）→ false，零 append/零投影', async () => {
    const { lifecycle, nativeUpdate, durable } = makeTruthLifecycle({
      row: { id: 'sub-1' },
      stream: [bootstrapped('sub-1', 'cancelled')],
    });
    const changed = await lifecycle.convergeStatus(
      'org-9',
      SUBSCRIPTION_STATUS.CANCELLED,
      SUBSCRIPTION_STATUS.ACTIVE,
    );
    expect(changed).toBe(false);
    expect(durable).toHaveLength(0);
    expect(nativeUpdate).not.toHaveBeenCalled();
  });

  it('无 from 行→ false，零 load/零 append（findFromRow 先于流裁决）', async () => {
    const { lifecycle, eventStore, durable } = makeTruthLifecycle({
      row: undefined,
      stream: [bootstrapped('sub-1', 'active')],
    });
    const changed = await lifecycle.convergeStatus(
      'org-9',
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
    expect(changed).toBe(false);
    expect(eventStore.load).not.toHaveBeenCalled();
    expect(durable).toHaveLength(0);
  });

  it('publishDurable 未实现时 fail-loud（拒静默降级）', async () => {
    const em = { find: vi.fn(async () => [{ id: 'sub-1' }]), nativeUpdate: vi.fn() };
    const mikro = { fork: async () => em };
    const publisher = { publishAll: vi.fn() } as unknown as DomainEventPublisher;
    const eventStore = { load: vi.fn(async () => [] as DomainEvent[]) } as unknown as EventStore;
    const uow = { run: <T>(fn: () => Promise<T>) => fn() } as unknown as UnitOfWork;
    const lifecycle = new MikroSubscriptionLifecycle(
      mikro as unknown as MikroOrmService,
      publisher,
      uow,
      eventStore,
      true,
    );
    await expect(
      lifecycle.convergeStatus('org-9', SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.SUSPENDED),
    ).rejects.toThrow(/publishDurable/);
  });
});

describe('MikroSubscriptionLifecycle.rebuildProjection（ES R4c · 单流重建）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fold 结果回写投影并返回状态', async () => {
    const { lifecycle, nativeUpdate } = makeTruthLifecycle({
      stream: [bootstrapped('sub-1', 'suspended')],
    });
    const status = await lifecycle.rebuildProjection('sub-1');
    expect(status).toBe('suspended');
    expect(nativeUpdate).toHaveBeenCalledWith(
      TenantSubscription,
      { id: 'sub-1' },
      expect.objectContaining({ status: 'suspended' }),
    );
  });

  it('空流 → 无状态记录 → 不写投影、返回 undefined', async () => {
    const { lifecycle, nativeUpdate } = makeTruthLifecycle({ stream: [] });
    const status = await lifecycle.rebuildProjection('sub-1');
    expect(status).toBeUndefined();
    expect(nativeUpdate).not.toHaveBeenCalled();
  });
});

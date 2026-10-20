import { TenantBootstrappedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-bootstrapped.event';
import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.service';
import type { TenantStatusStore } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.store';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 桩 `TenantStatusStore`（§9.5.4①B 端口倒置·收权案切片 B 换轨后 status 导向三原语）。
 * `orgExists=false` 模拟本体行不存在（not-found/404 判据）；`status=undefined` 模拟无户籍
 * 行（存量/seeded·deny-list 不拦、迁移表视同 active）。metadata 透传形已随寄居退场。
 * ES 第二切片：publisher 桩捕获事件，锁「ok 才发、not-found/illegal 不发」。
 */
function makeService(opts: { orgExists?: boolean; status?: TenantStatus }, publishError?: Error) {
  const upsert = vi.fn(async (_id: string, _status: TenantStatus) => {});
  const readStatus = vi.fn(async (_id: string) => opts.status);
  const organizationExists = vi.fn(async (_id: string) => opts.orgExists ?? true);
  const store = { readStatus, organizationExists, upsert } as unknown as TenantStatusStore;
  const published: DomainEvent[] = [];
  const publisher = {
    publishAll: vi.fn(async (events: readonly DomainEvent[]) => {
      if (publishError) throw publishError;
      published.push(...events);
    }),
  } as unknown as DomainEventPublisher;
  return {
    svc: new TenantStatusService(store, publisher, { run: <T>(fn: () => Promise<T>) => fn() }),
    readStatus,
    organizationExists,
    upsert,
    published,
    publisher,
  };
}

describe('TenantStatusService.transition (S5 · §9.4 严格迁移单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts the tenant registry row and returns ok with the previous status', async () => {
    const { svc, upsert } = makeService({ status: TENANT_STATUS.PENDING });
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'ok',
      previous: TENANT_STATUS.PENDING,
      status: TENANT_STATUS.ACTIVE,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    // 户籍表只承状态（不再透传 metadata blob·收权案换轨）
    expect(upsert.mock.calls[0]).toEqual(['orgA', TENANT_STATUS.ACTIVE]);
  });

  it('returns not-found when the organization row is absent', async () => {
    const { svc, upsert, published } = makeService({ orgExists: false });
    const result = await svc.transition('ghost', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({ kind: 'not-found' });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('not-found keys on the organization row, independent of registry presence', async () => {
    // 本体不存在但户籍查询照常短路：organizationExists 先行，readStatus 不应被触达
    const { svc, readStatus, upsert } = makeService({ orgExists: false, status: undefined });
    await svc.transition('ghost', TENANT_STATUS.ACTIVE);
    expect(readStatus).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns illegal without writing when the edge is disallowed', async () => {
    const { svc, upsert, published } = makeService({ status: TENANT_STATUS.DELETED });
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: TENANT_STATUS.ACTIVE,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('treats an unrecorded status as active for the transition table', async () => {
    // 无户籍行（readStatus → undefined）→ 视同 active → active→suspended 合法
    const { svc, published } = makeService({ status: undefined });
    const result = await svc.transition('orgA', TENANT_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: TENANT_STATUS.SUSPENDED,
    });
    // 未记录态在事件 payload 中为 null（与 previous===undefined 同口径·§3.1）
    expect((published[0].payload as { from: unknown }).from).toBeNull();
  });
});

describe('TenantStatusService.transition 事件产出（ES 第二切片 §3.1）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes one faithful tenant.status.transitioned envelope after a legal transition', async () => {
    const { svc, published, publisher } = makeService({ status: TENANT_STATUS.PENDING });
    await svc.transition('orgA', TENANT_STATUS.ACTIVE, {
      actorId: 'op-1',
      reason: 'approved',
    });
    expect(publisher.publishAll).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
    const event = published[0];
    expect(event).toMatchObject({
      aggregateType: 'tenant',
      aggregateId: 'orgA',
      eventType: 'tenant.status.transitioned',
      eventVersion: 1,
      payload: { from: 'pending_approval', to: 'active', actorId: 'op-1', reason: 'approved' },
    });
    expect(typeof event.eventId).toBe('string');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('omits absent actor/reason from the payload but still emits', async () => {
    const { svc, published } = makeService({ status: TENANT_STATUS.ACTIVE });
    await svc.transition('orgA', TENANT_STATUS.SUSPENDED);
    expect(published[0].payload).toEqual({ from: 'active', to: 'suspended' });
  });

  it('fails loud when publishing fails after save（宁缺勿错发·错误不吞）', async () => {
    const { svc, upsert } = makeService(
      { status: TENANT_STATUS.ACTIVE },
      new Error('append blew up'),
    );
    await expect(svc.transition('orgA', TENANT_STATUS.SUSPENDED)).rejects.toThrow('append blew up');
    // 写先行、发布在后：upsert 已发生（非事务窗口如实呈记·§3.1）
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

/**
 * ES R1c 真相源写切换镜测（module-es-r1-replay-core §3-R1c）：旋钮开时
 * `transition` 以 fold 重放态为裁决输入、走 `publishDurable`（带 expectedVersion 乐观锁）
 * + 投影 upsert(fold 结果)，**不触表行 readStatus、不调 publishAll**。
 */
function makeTruthService(stream: DomainEvent[]) {
  const upsert = vi.fn(async (_id: string, _status: TenantStatus) => {});
  const organizationExists = vi.fn(async () => true);
  const readStatus = vi.fn(async () => {
    throw new Error('truth-source 路径不得回退到表行 readStatus');
  });
  const store = { readStatus, organizationExists, upsert } as unknown as TenantStatusStore;
  const durable: Array<{ events: readonly DomainEvent[]; version: number }> = [];
  const publisher = {
    publishAll: vi.fn(async () => {
      throw new Error('truth-source 路径不得调 publishAll（会二次 append）');
    }),
    publishDurable: vi.fn(async (events: readonly DomainEvent[], version: number) => {
      durable.push({ events, version });
    }),
  } as unknown as DomainEventPublisher;
  const eventStore = { load: vi.fn(async () => stream) } as unknown as EventStore;
  const svc = new TenantStatusService(
    store,
    publisher,
    { run: <T>(fn: () => Promise<T>) => fn() },
    eventStore,
    true,
  );
  return { svc, upsert, readStatus, durable, publisher, eventStore };
}

const bootstrapped = (status: TenantStatus) =>
  new TenantBootstrappedEvent({ aggregateId: 'orgA', payload: { status, actorId: 'bootstrap' } });

describe('TenantStatusService.transition 真相源写切换（ES R1c · 旋钮开）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('以 fold 前置态裁决 + publishDurable(expectedVersion=流长+1) + 投影 upsert(fold 结果)', async () => {
    const { svc, upsert, durable } = makeTruthService([bootstrapped(TENANT_STATUS.PENDING)]);
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE, { actorId: 'op-1' });
    expect(result).toEqual({
      kind: 'ok',
      previous: TENANT_STATUS.PENDING,
      status: TENANT_STATUS.ACTIVE,
    });
    // 流长 1 ⇒ expectedVersion 2（与 store.append 内部 max+1 同律）
    expect(durable).toHaveLength(1);
    expect(durable[0].version).toBe(2);
    expect(durable[0].events[0]).toMatchObject({
      eventType: 'tenant.status.transitioned',
      aggregateId: 'orgA',
      payload: { from: 'pending_approval', to: 'active', actorId: 'op-1' },
    });
    // 投影 = fold 结果（非手推）
    expect(upsert).toHaveBeenCalledWith('orgA', TENANT_STATUS.ACTIVE);
  });

  it('非法迁移（fold 终态 deleted → active）→ illegal，零 append/零投影', async () => {
    const { svc, upsert, durable } = makeTruthService([bootstrapped(TENANT_STATUS.DELETED)]);
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: TENANT_STATUS.ACTIVE,
    });
    expect(durable).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('空流（无快照）→ previous undefined·视同 active·expectedVersion=1', async () => {
    const { svc, durable, upsert } = makeTruthService([]);
    const result = await svc.transition('orgA', TENANT_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: TENANT_STATUS.SUSPENDED,
    });
    expect(durable[0].version).toBe(1);
    expect((durable[0].events[0].payload as { from: unknown }).from).toBeNull();
    expect(upsert).toHaveBeenCalledWith('orgA', TENANT_STATUS.SUSPENDED);
  });

  it('publishDurable 未实现时 fail-loud（拒静默降级）', async () => {
    const store = {
      organizationExists: vi.fn(async () => true),
      readStatus: vi.fn(async () => undefined),
      upsert: vi.fn(async () => {}),
    } as unknown as TenantStatusStore;
    const publisher = { publishAll: vi.fn() } as unknown as DomainEventPublisher;
    const eventStore = { load: vi.fn(async () => []) } as unknown as EventStore;
    const svc = new TenantStatusService(
      store,
      publisher,
      { run: <T>(fn: () => Promise<T>) => fn() },
      eventStore,
      true,
    );
    await expect(svc.transition('orgA', TENANT_STATUS.ACTIVE)).rejects.toThrow(/publishDurable/);
  });
});

describe('TenantStatusService.rebuildTenantProjection（ES R1c · 单流重建）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fold 结果回写投影并返回状态', async () => {
    const { svc, upsert } = makeTruthService([bootstrapped(TENANT_STATUS.SUSPENDED)]);
    const status = await svc.rebuildTenantProjection('orgA');
    expect(status).toBe(TENANT_STATUS.SUSPENDED);
    expect(upsert).toHaveBeenCalledWith('orgA', TENANT_STATUS.SUSPENDED);
  });

  it('空流 → 无状态记录 → 不写投影、返回 undefined', async () => {
    const { svc, upsert } = makeTruthService([]);
    const status = await svc.rebuildTenantProjection('orgA');
    expect(status).toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
  });
});

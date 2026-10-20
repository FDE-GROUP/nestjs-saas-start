import type {
  QuotaService,
  SeatQuotaSnapshot,
} from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import type { UnitOfWork } from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProvisioner } from '../../../domain/ports/customer-provisioner.port';
import type { SubscriptionRepository } from '../../../domain/repositories/subscription.repository';
import { CreateSubscriptionCommandHandler } from './create-subscription.command-handler';

const VIEW: SeatQuotaSnapshot = {
  hasSubscription: true,
  plan: 'pro',
  seatsLimit: 50,
  used: 3,
  remaining: 47,
  providerCustomerId: 'cus_1',
};

function makeDeps() {
  const create = vi.fn().mockResolvedValue({ id: 'sub1' });
  const subscriptions = { create } as unknown as SubscriptionRepository;
  // §9.5.4①B/④ · P1c：处理器经 `CustomerProvisioner` 端口消费客户开通（PaymentService 适配留应用侧）。
  const provisionCustomer = vi.fn().mockResolvedValue({ id: 'cus_1', providerId: 'stripe' });
  const customers = { provisionCustomer } as unknown as CustomerProvisioner;
  const snapshot = vi.fn().mockResolvedValue(VIEW);
  const quota = { snapshot } as unknown as QuotaService;
  const tenant = { requireTenantId: () => 'orgA' } as unknown as TenantContextService;
  return {
    handler: new CreateSubscriptionCommandHandler(subscriptions, customers, quota, tenant),
    create,
    provisionCustomer,
    snapshot,
  };
}

describe('CreateSubscriptionCommandHandler (S7 · FR-8 tenant↔customer 映射)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the provider customer, maps it onto the row, defaults seats from the plan', async () => {
    const { handler, provisionCustomer, create } = makeDeps();
    const view = await handler.execute({ plan: 'pro', customerEmail: 'a@b.com' } as never);
    expect(provisionCustomer).toHaveBeenCalledWith('a@b.com');
    const draft = create.mock.calls[0][0] as Record<string, unknown>;
    expect(draft).toMatchObject({
      plan: 'pro',
      seatsLimit: 50, // pro 档位目录默认
      provider: 'stripe',
      providerCustomerId: 'cus_1',
    });
    expect(view).toBe(VIEW);
  });

  it('honours an explicit seatsLimit override', async () => {
    const { handler, create } = makeDeps();
    await handler.execute({ plan: 'pro', customerEmail: 'a@b.com', seatsLimit: 999 } as never);
    const draft = create.mock.calls[0][0] as Record<string, unknown>;
    expect(draft.seatsLimit).toBe(999);
  });

  it('does not persist a row when the provider customer creation fails (503 propagate)', async () => {
    const { create } = makeDeps();
    const failing = new CreateSubscriptionCommandHandler(
      { create } as unknown as SubscriptionRepository,
      {
        provisionCustomer: vi.fn().mockRejectedValue(new Error('no provider')),
      } as unknown as CustomerProvisioner,
      { snapshot: vi.fn() } as unknown as QuotaService,
      { requireTenantId: () => 'orgA' } as unknown as TenantContextService,
    );
    await expect(
      failing.execute({ plan: 'free', customerEmail: 'a@b.com' } as never),
    ).rejects.toThrow(/no provider/);
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * ES R4c 真相源写切换镜测（module-es-r4-second-context-subscriptions §3-R4c·沿 R1c 先例）：
 * 旋钮开时 `execute` 走「uow 内 create 插行→load 空流→发 `subscription.created` 流起点
 * 经 publishDurable(expectedVersion=流长+1=1)」，**不调 publishAll**；旋钮关（缺省）由上方
 * 三测锁定逐字节不变（仅 CRUD 插行·零事件）。
 */
function makeTruthDeps(streamLen = 0) {
  const create = vi
    .fn()
    .mockResolvedValue({ id: 'sub1', tenantId: 'orgA', plan: 'pro', status: 'active' });
  const subscriptions = { create } as unknown as SubscriptionRepository;
  const provisionCustomer = vi.fn().mockResolvedValue({ id: 'cus_1', providerId: 'stripe' });
  const customers = { provisionCustomer } as unknown as CustomerProvisioner;
  const snapshot = vi.fn().mockResolvedValue(VIEW);
  const quota = { snapshot } as unknown as QuotaService;
  const tenant = { requireTenantId: () => 'orgA' } as unknown as TenantContextService;
  const durable: Array<{ events: readonly DomainEvent[]; version: number }> = [];
  const events = {
    publishAll: vi.fn(async () => {
      throw new Error('truth-source 路径不得调 publishAll（会二次 append）');
    }),
    publishDurable: vi.fn(
      async (evts: readonly DomainEvent[], version: number) =>
        void durable.push({ events: evts, version }),
    ),
  } as unknown as DomainEventPublisher;
  const uow = { run: <T>(fn: () => Promise<T>) => fn() } as unknown as UnitOfWork;
  const load = vi.fn(async () => Array.from({ length: streamLen }) as unknown as DomainEvent[]);
  const eventStore = { load } as unknown as EventStore;
  const handler = new CreateSubscriptionCommandHandler(
    subscriptions,
    customers,
    quota,
    tenant,
    events,
    uow,
    eventStore,
    true,
  );
  return { handler, create, durable, load, snapshot };
}

describe('CreateSubscriptionCommandHandler.execute 真相源写切换（ES R4c · 旋钮开）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('新建即 subscription.created 成流：expectedVersion=流长+1·payload 携 plan/status·投影 create 先于 append', async () => {
    const { handler, create, durable, load, snapshot } = makeTruthDeps();
    const view = await handler.execute({ plan: 'pro', customerEmail: 'a@b.com' } as never);
    // 新行空流⇒load('subscription','sub1')·expectedVersion=0+1=1。
    expect(create).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('subscription', 'sub1');
    expect(durable).toHaveLength(1);
    expect(durable[0].version).toBe(1);
    expect(durable[0].events[0]).toMatchObject({
      eventType: 'subscription.created',
      aggregateId: 'sub1',
      payload: { plan: 'pro', status: 'active' },
    });
    expect(snapshot).toHaveBeenCalledWith('orgA');
    expect(view).toBe(VIEW);
  });

  it('publishDurable 未实现时 fail-loud（零插行·拒静默降级）', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'sub1', tenantId: 'orgA', plan: 'pro', status: 'active' });
    const handler = new CreateSubscriptionCommandHandler(
      { create } as unknown as SubscriptionRepository,
      {
        provisionCustomer: vi.fn().mockResolvedValue({ id: 'cus_1', providerId: 'stripe' }),
      } as unknown as CustomerProvisioner,
      { snapshot: vi.fn() } as unknown as QuotaService,
      { requireTenantId: () => 'orgA' } as unknown as TenantContextService,
      { publishAll: vi.fn() } as unknown as DomainEventPublisher,
      { run: <T>(fn: () => Promise<T>) => fn() } as unknown as UnitOfWork,
      { load: vi.fn(async () => []) } as unknown as EventStore,
      true,
    );
    await expect(
      handler.execute({ plan: 'pro', customerEmail: 'a@b.com' } as never),
    ).rejects.toThrow(/publishDurable/);
    expect(create).not.toHaveBeenCalled();
  });
});

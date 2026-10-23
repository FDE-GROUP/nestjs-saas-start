import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import {
  USER_STATUS,
  UserStatusService,
} from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { UserStatusStore } from '@core/saas-kit/modules/organizations/lifecycle/user-status.store';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 桩 `UserStatusStore`（§9.5.4①B 端口倒置后·服务不再感知 ORM/schema）。
 * `exists` 控 user 存在性；`status` 控 user_status 行状态（undefined=无行）。
 * ES 第三切片：publisher 桩捕获事件，锁「ok 才发、not-found/illegal 不发」。
 */
function makeService(opts: { exists?: boolean; status?: string; publishError?: Error } = {}) {
  const upsert = vi.fn(async (_id: string, _s: string, _r: string | null) => {});
  const userExists = vi.fn(async (_id: string) => opts.exists ?? true);
  const readStatus = vi.fn(async (_id: string) => opts.status);
  const store = { readStatus, userExists, upsert } as unknown as UserStatusStore;
  const published: DomainEvent[] = [];
  const publisher = {
    publishAll: vi.fn(async (events: readonly DomainEvent[]) => {
      if (opts.publishError) throw opts.publishError;
      published.push(...events);
    }),
  } as unknown as DomainEventPublisher;
  return {
    svc: new UserStatusService(store, publisher, { run: <T>(fn: () => Promise<T>) => fn() }),
    upsert,
    userExists,
    readStatus,
    published,
    publisher,
  };
}

describe('UserStatusService.transition (S6 · FR-10 用户暂停单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts a suspended row and returns ok (missing prior row → treated active)', async () => {
    const { svc, upsert } = makeService({ exists: true, status: undefined });
    const result = await svc.transition('u1', USER_STATUS.SUSPENDED, { reason: 'fraud' });
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: USER_STATUS.SUSPENDED,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith('u1', 'suspended', 'fraud');
  });

  it('returns not-found when the platform user does not exist', async () => {
    const { svc, upsert, published } = makeService({ exists: false });
    const result = await svc.transition('ghost', USER_STATUS.SUSPENDED);
    expect(result).toEqual({ kind: 'not-found' });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('returns illegal without writing when the edge is disallowed (deleted is terminal)', async () => {
    const { svc, upsert, published } = makeService({
      exists: true,
      status: ORGANIZATION_STATUS.DELETED,
    });
    const result = await svc.transition('u1', USER_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'illegal',
      from: ORGANIZATION_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });
});

describe('UserStatusService.transition 事件产出（ES 第三切片 §3.1）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes one faithful user.status.transitioned envelope after a legal transition', async () => {
    const { svc, published, publisher } = makeService({ exists: true, status: 'active' });
    await svc.transition('u1', USER_STATUS.SUSPENDED, { reason: 'fraud', actorId: 'op-1' });
    expect(publisher.publishAll).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
    const event = published[0];
    expect(event).toMatchObject({
      // 刻意与 user.registered 同聚合流（§1 同流设计·PIPL 补删零额外代码）
      aggregateType: 'user',
      aggregateId: 'u1',
      eventType: 'user.status.transitioned',
      eventVersion: 1,
      payload: { from: 'active', to: 'suspended', actorId: 'op-1', reason: 'fraud' },
    });
    expect(typeof event.eventId).toBe('string');
  });

  it('prior-row-absent becomes from:null; absent actor/reason stay out of payload', async () => {
    const { svc, published } = makeService({ exists: true, status: undefined });
    await svc.transition('u1', USER_STATUS.SUSPENDED);
    expect(published[0].payload).toEqual({ from: null, to: 'suspended' });
  });

  it('fails loud when publishing fails after upsert（宁缺勿错发·错误不吞）', async () => {
    const { svc, upsert } = makeService({
      exists: true,
      status: 'active',
      publishError: new Error('append blew up'),
    });
    await expect(svc.transition('u1', USER_STATUS.SUSPENDED)).rejects.toThrow('append blew up');
    // 写先行、发布在后：upsert 已发生（非事务窗口与租户切片同语义）
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('UserStatusService.isBlocked / read (deny-list)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks explicit suspended / deleted', async () => {
    expect(await makeService({ status: 'suspended' }).svc.isBlocked('u1')).toBe(true);
    expect(await makeService({ status: 'deleted' }).svc.isBlocked('u1')).toBe(true);
  });

  it('does not block a missing row (treated active)', async () => {
    const { svc } = makeService({ status: undefined });
    expect(await svc.isBlocked('u1')).toBe(false);
    expect(await svc.read('u1')).toBeUndefined();
  });
});

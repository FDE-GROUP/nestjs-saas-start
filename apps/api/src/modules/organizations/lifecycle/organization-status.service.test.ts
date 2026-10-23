import {
  ORGANIZATION_STATUS,
  type OrganizationStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import type { OrganizationStatusStore } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.store';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 桩 `OrganizationStatusStore`（§9.5.4①B 端口倒置·收权案切片 B 换轨后 status 导向三原语）。
 * `orgExists=false` 模拟本体行不存在（not-found/404 判据）；`status=undefined` 模拟无户籍
 * 行（存量/seeded·deny-list 不拦、迁移表视同 active）。metadata 透传形已随寄居退场。
 * ES 第二切片：publisher 桩捕获事件，锁「ok 才发、not-found/illegal 不发」。
 */
function makeService(
  opts: { orgExists?: boolean; status?: OrganizationStatus },
  publishError?: Error,
) {
  const upsert = vi.fn(async (_id: string, _status: OrganizationStatus) => {});
  const readStatus = vi.fn(async (_id: string) => opts.status);
  const organizationExists = vi.fn(async (_id: string) => opts.orgExists ?? true);
  const store = { readStatus, organizationExists, upsert } as unknown as OrganizationStatusStore;
  const published: DomainEvent[] = [];
  const publisher = {
    publishAll: vi.fn(async (events: readonly DomainEvent[]) => {
      if (publishError) throw publishError;
      published.push(...events);
    }),
  } as unknown as DomainEventPublisher;
  return {
    svc: new OrganizationStatusService(store, publisher, {
      run: <T>(fn: () => Promise<T>) => fn(),
    }),
    readStatus,
    organizationExists,
    upsert,
    published,
    publisher,
  };
}

describe('OrganizationStatusService.transition (S5 · §9.4 严格迁移单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts the tenant registry row and returns ok with the previous status', async () => {
    const { svc, upsert } = makeService({ status: ORGANIZATION_STATUS.PENDING });
    const result = await svc.transition('orgA', ORGANIZATION_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'ok',
      previous: ORGANIZATION_STATUS.PENDING,
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    // 户籍表只承状态（不再透传 metadata blob·收权案换轨）
    expect(upsert.mock.calls[0]).toEqual(['orgA', ORGANIZATION_STATUS.ACTIVE]);
  });

  it('returns not-found when the organization row is absent', async () => {
    const { svc, upsert, published } = makeService({ orgExists: false });
    const result = await svc.transition('ghost', ORGANIZATION_STATUS.ACTIVE);
    expect(result).toEqual({ kind: 'not-found' });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('not-found keys on the organization row, independent of registry presence', async () => {
    // 本体不存在但户籍查询照常短路：organizationExists 先行，readStatus 不应被触达
    const { svc, readStatus, upsert } = makeService({ orgExists: false, status: undefined });
    await svc.transition('ghost', ORGANIZATION_STATUS.ACTIVE);
    expect(readStatus).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns illegal without writing when the edge is disallowed', async () => {
    const { svc, upsert, published } = makeService({ status: ORGANIZATION_STATUS.DELETED });
    const result = await svc.transition('orgA', ORGANIZATION_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'illegal',
      from: ORGANIZATION_STATUS.DELETED,
      to: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('treats an unrecorded status as active for the transition table', async () => {
    // 无户籍行（readStatus → undefined）→ 视同 active → active→suspended 合法
    const { svc, published } = makeService({ status: undefined });
    const result = await svc.transition('orgA', ORGANIZATION_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: ORGANIZATION_STATUS.SUSPENDED,
    });
    // 未记录态在事件 payload 中为 null（与 previous===undefined 同口径·§3.1）
    expect((published[0].payload as { from: unknown }).from).toBeNull();
  });
});

describe('OrganizationStatusService.transition 事件产出（ES 第二切片 §3.1）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes one faithful tenant.status.transitioned envelope after a legal transition', async () => {
    const { svc, published, publisher } = makeService({ status: ORGANIZATION_STATUS.PENDING });
    await svc.transition('orgA', ORGANIZATION_STATUS.ACTIVE, {
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
    const { svc, published } = makeService({ status: ORGANIZATION_STATUS.ACTIVE });
    await svc.transition('orgA', ORGANIZATION_STATUS.SUSPENDED);
    expect(published[0].payload).toEqual({ from: 'active', to: 'suspended' });
  });

  it('fails loud when publishing fails after save（宁缺勿错发·错误不吞）', async () => {
    const { svc, upsert } = makeService(
      { status: ORGANIZATION_STATUS.ACTIVE },
      new Error('append blew up'),
    );
    await expect(svc.transition('orgA', ORGANIZATION_STATUS.SUSPENDED)).rejects.toThrow(
      'append blew up',
    );
    // 写先行、发布在后：upsert 已发生（非事务窗口如实呈记·§3.1）
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

import {
  ORGANIZATION_STATUS,
  type OrganizationStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import type { TenantStatusStore } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.store';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 治理换轴（rehierarchy 切片 E-F）新单元 `TenantStatusService` 单测：租户准入态权威读写卡点·
 * 锚 `tenant.status`（status 导向三原语形制·判存原语为 `tenantExists`）。
 * 锁三件事：① §9.4 严格迁移单点（ok/not-found/illegal）；② 合法迁移产出 faithful
 * `tenant.status.transitioned`（aggregateType=tenant·aggregateId=tenantId）；③ fail-closed
 * 读侧（isActive/isBlocked）+ 发布失败 loud（宁缺勿错发）。
 */
function makeService(
  opts: { tenantExists?: boolean; status?: OrganizationStatus },
  publishError?: Error,
) {
  const upsert = vi.fn(async (_id: string, _status: OrganizationStatus) => {});
  const readStatus = vi.fn(async (_id: string) => opts.status);
  const tenantExists = vi.fn(async (_id: string) => opts.tenantExists ?? true);
  const store = { readStatus, tenantExists, upsert } as unknown as TenantStatusStore;
  const published: DomainEvent[] = [];
  const publisher = {
    publishAll: vi.fn(async (events: readonly DomainEvent[]) => {
      if (publishError) throw publishError;
      published.push(...events);
    }),
  } as unknown as DomainEventPublisher;
  return {
    svc: new TenantStatusService(store, publisher, {
      run: <T>(fn: () => Promise<T>) => fn(),
    }),
    readStatus,
    tenantExists,
    upsert,
    published,
  };
}

describe('TenantStatusService.transition (治理换轴 E-F · §9.4 严格迁移单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pending_approval → active：写回 tenant.status 并回 previous', async () => {
    const { svc, upsert } = makeService({ status: ORGANIZATION_STATUS.PENDING });
    const result = await svc.transition('tenantA', ORGANIZATION_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'ok',
      previous: ORGANIZATION_STATUS.PENDING,
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]).toEqual(['tenantA', ORGANIZATION_STATUS.ACTIVE]);
  });

  it('租户本体不存在 → not-found（不写、不发事件）', async () => {
    const { svc, upsert, published } = makeService({ tenantExists: false });
    const result = await svc.transition('ghost', ORGANIZATION_STATUS.ACTIVE);
    expect(result).toEqual({ kind: 'not-found' });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('not-found 键在租户本体，短路先于读态', async () => {
    const { svc, readStatus, upsert } = makeService({ tenantExists: false, status: undefined });
    await svc.transition('ghost', ORGANIZATION_STATUS.ACTIVE);
    expect(readStatus).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('非法迁移（deleted 终态）→ illegal（不写、不发）', async () => {
    const { svc, upsert, published } = makeService({ status: ORGANIZATION_STATUS.DELETED });
    const result = await svc.transition('tenantA', ORGANIZATION_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'illegal',
      from: ORGANIZATION_STATUS.DELETED,
      to: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('无状态记录（readStatus → undefined）视同 active（deny-list 同口径）', async () => {
    const { svc, published } = makeService({ status: undefined });
    const result = await svc.transition('tenantA', ORGANIZATION_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: ORGANIZATION_STATUS.SUSPENDED,
    });
    expect((published[0].payload as { from: unknown }).from).toBeNull();
  });
});

describe('TenantStatusService 事件产出 + fail-closed 读', () => {
  beforeEach(() => vi.clearAllMocks());

  it('合法迁移后产一封 faithful tenant.status.transitioned（aggregateType=tenant·aggregateId=tenantId）', async () => {
    const { svc, published } = makeService({ status: ORGANIZATION_STATUS.PENDING });
    await svc.transition('tenantA', ORGANIZATION_STATUS.ACTIVE, {
      actorId: 'op-1',
      reason: 'approved',
    });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      aggregateType: 'tenant',
      aggregateId: 'tenantA',
      eventType: 'tenant.status.transitioned',
      eventVersion: 1,
      payload: { from: 'pending_approval', to: 'active', actorId: 'op-1', reason: 'approved' },
    });
  });

  it('isActive：仅显式 active 为真（fail-closed）', async () => {
    const { svc } = makeService({ status: ORGANIZATION_STATUS.PENDING });
    expect(await svc.isActive('tenantA')).toBe(false);
  });

  it('isBlocked：pending/suspended/deleted 拦、无记录不拦', async () => {
    expect(await makeService({ status: ORGANIZATION_STATUS.PENDING }).svc.isBlocked('t')).toBe(
      true,
    );
    expect(await makeService({ status: ORGANIZATION_STATUS.SUSPENDED }).svc.isBlocked('t')).toBe(
      true,
    );
    expect(await makeService({ status: undefined }).svc.isBlocked('t')).toBe(false);
  });

  it('发布失败 loud（写先行、发布在后·错误不吞）', async () => {
    const { svc, upsert } = makeService(
      { status: ORGANIZATION_STATUS.ACTIVE },
      new Error('append blew up'),
    );
    await expect(svc.transition('tenantA', ORGANIZATION_STATUS.SUSPENDED)).rejects.toThrow(
      'append blew up',
    );
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

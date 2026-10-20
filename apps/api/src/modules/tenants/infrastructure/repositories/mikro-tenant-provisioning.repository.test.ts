import { Organization } from '@app/database/ba/entities';
import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { AuthInstance, InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tenant } from '../entities/tenant.entity';
import { MikroTenantProvisioningRepository } from './mikro-tenant-provisioning.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）· global-tenant-entity-reclamation 切片 B 换轨后的镜像断言：
 * `submit` 两段——BA `createOrganization` 系统动作（FR-12·**BA 面不再携生命周期态**）+
 * `tenant` 户籍行 upsert（pending_approval·新行不携 updatedAt·L2）；`remove` 维
 * `em.nativeDelete(Organization,{id})`（纯 SQL DELETE·六子表含 tenant 由 FK cascade·R-B3 同律·>0 为实删）。
 * `organization`/`tenant` 属 tenants 上下文 → 写侧纪律天然合规。
 */
function makeDeps(deletedCount = 1) {
  const createOrganization = vi
    .fn()
    .mockImplementation(({ body }: { body: any }) =>
      Promise.resolve({ id: 'org-new', metadata: body.metadata }),
    );
  const auth = { api: { createOrganization } } as unknown as AuthInstance;
  const authInstance = { get: () => auth, set: () => {} } as InjectAuthInstance;

  const nativeDelete = vi.fn().mockResolvedValue(deletedCount);
  const upsert = vi.fn().mockResolvedValue(undefined);
  const em = { nativeDelete, upsert } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroTenantProvisioningRepository(mikro, authInstance),
    spies: { createOrganization, nativeDelete, upsert, fork },
  };
}

describe('MikroTenantProvisioningRepository (S-d2 · FR-1 唯一建租户通道)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submit() calls BA createOrganization as a system action and registers the tenant row as pending_approval', async () => {
    const { repo, spies } = makeDeps();
    const receipt = await repo.submit('user-1', 'Acme', 'acme');

    const body = spies.createOrganization.mock.calls[0][0].body as Record<string, unknown>;
    expect(body.userId).toBe('user-1');
    expect(body.name).toBe('Acme');
    expect(body.slug).toBe('acme');
    // 收权后 BA 面零我方寄居键（status/appliedAt 全退场·判据②字面清零）
    expect(body).not.toHaveProperty('metadata');
    // 户籍行紧随：upsert tenant(pending_approval)·新行不携 updatedAt（建后未改·L2）
    expect(spies.upsert).toHaveBeenCalledTimes(1);
    const [entity, data] = spies.upsert.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entity).toBe(Tenant);
    expect(data).toEqual({ id: 'org-new', status: TENANT_STATUS.PENDING });
    expect(receipt).toEqual({ organizationId: 'org-new', status: TENANT_STATUS.PENDING });
    expect(spies.nativeDelete).not.toHaveBeenCalled();
  });

  it('submit() loud-fails when BA returns no organization id（无本体则不建户籍）', async () => {
    const { repo, spies } = makeDeps();
    spies.createOrganization.mockResolvedValueOnce(undefined as never);
    await expect(repo.submit('u', 'n', 's')).rejects.toThrow(/no organization id/);
    expect(spies.upsert).not.toHaveBeenCalled();
  });

  it('submit() throws when the auth instance is not yet initialized', async () => {
    const coldAuth = {
      get: () => undefined as unknown as AuthInstance,
      set: () => {},
    } as InjectAuthInstance;
    const mikro = { fork: vi.fn() } as unknown as MikroOrmService;
    const repo = new MikroTenantProvisioningRepository(mikro, coldAuth);
    await expect(repo.submit('u', 'n', 's')).rejects.toThrow(/Auth instance not initialized/);
  });

  it('remove() nativeDeletes scoped by organization id → true on hit (single card, FK cascade·不逐表删)', async () => {
    const { repo, spies } = makeDeps(1);
    expect(await repo.remove('org-1')).toBe(true);
    expect(spies.fork).toHaveBeenCalledTimes(1);
    expect(spies.nativeDelete).toHaveBeenCalledTimes(1);
    const [entity, where] = spies.nativeDelete.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entity).toBe(Organization);
    expect(where).toEqual({ id: 'org-1' });
  });

  it('remove() → false on miss (idempotent·0 affected)', async () => {
    const { repo } = makeDeps(0);
    expect(await repo.remove('ghost')).toBe(false);
  });
});

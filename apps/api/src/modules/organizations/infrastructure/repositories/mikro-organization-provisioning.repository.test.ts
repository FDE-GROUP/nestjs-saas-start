import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { AuthInstance, InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroOrganizationProvisioningRepository } from './mikro-organization-provisioning.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）· global-governance-lifecycle-consolidation 切片 B 归列后的镜像断言：
 * `submit` 两段——BA `createOrganization` 系统动作（FR-12·**BA 面不再携生命周期态**·org 落 DB 默认 'active'）+
 * 同流紧接着 `nativeUpdate(Organization,{id},{status:pending_approval})` 显式覆写（堵 O1·不盖 updatedAt）；
 * `remove` 维 `em.nativeDelete(Organization,{id})`（纯 SQL DELETE·五子表由 FK cascade·R-B3 同律·>0 为实删）。
 * rehierarchy 切片 C 换轴：新 org 同流 ensure 专属 `Tenant` 行（id=orgId·1:1 骨架）+ 盖 `organization.tenantId`。
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
  const nativeUpdate = vi.fn().mockResolvedValue(1);
  // 换轴写链：Tenant 行不存在→懒建（findOne 返回 null）。
  const findOne = vi.fn().mockResolvedValue(null);
  const created: Array<{ entity: unknown; row: Record<string, unknown> }> = [];
  const create = vi.fn((entity: unknown, data: Record<string, unknown>) => {
    created.push({ entity, row: { ...data } });
    return data;
  });
  const flush = vi.fn().mockResolvedValue(undefined);
  const em = { nativeDelete, nativeUpdate, findOne, create, flush } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroOrganizationProvisioningRepository(mikro, authInstance),
    spies: {
      createOrganization,
      nativeDelete,
      nativeUpdate,
      findOne,
      create,
      flush,
      fork,
      created,
    },
  };
}

describe('MikroOrganizationProvisioningRepository (S-d2 · FR-1 唯一建租户通道)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submit() calls BA createOrganization as a system action and overwrites organization.status to pending_approval', async () => {
    const { repo, spies } = makeDeps();
    const receipt = await repo.submit('user-1', 'Acme', 'acme');

    const body = spies.createOrganization.mock.calls[0][0].body as Record<string, unknown>;
    expect(body.userId).toBe('user-1');
    expect(body.name).toBe('Acme');
    expect(body.slug).toBe('acme');
    // 归列后 BA 面零我方寄居键（status/appliedAt 全退场·判据②字面清零）
    expect(body).not.toHaveProperty('metadata');
    // 紧随覆写：nativeUpdate organization(pending_approval)·不盖 updatedAt（建后未改·L2）
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
    const [entity, where, data] = spies.nativeUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(Organization);
    expect(where).toEqual({ id: 'org-new' });
    expect(data).toEqual({ status: ORGANIZATION_STATUS.PENDING, tenantId: 'org-new' });
    expect(receipt).toEqual({ organizationId: 'org-new', status: ORGANIZATION_STATUS.PENDING });
    expect(spies.nativeDelete).not.toHaveBeenCalled();
    // 换轴写链：同流 ensure 专属租户行（id=orgId·1:1 骨架）。
    const tenantRows = spies.created.filter((c) => c.entity === Tenant);
    expect(tenantRows).toHaveLength(1);
    expect(tenantRows[0].row).toMatchObject({ id: 'org-new', name: 'Acme', slug: 'acme' });
  });

  it('submit() loud-fails when BA returns no organization id（无本体则不翻态）', async () => {
    const { repo, spies } = makeDeps();
    spies.createOrganization.mockResolvedValueOnce(undefined as never);
    await expect(repo.submit('u', 'n', 's')).rejects.toThrow(/no organization id/);
    expect(spies.nativeUpdate).not.toHaveBeenCalled();
  });

  it('submit() throws when the auth instance is not yet initialized', async () => {
    const coldAuth = {
      get: () => undefined as unknown as AuthInstance,
      set: () => {},
    } as InjectAuthInstance;
    const mikro = { fork: vi.fn() } as unknown as MikroOrmService;
    const repo = new MikroOrganizationProvisioningRepository(mikro, coldAuth);
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

import { Organization } from '@app/database/ba/entities';
import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { AuthInstance, InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroTenantProvisioningRepository } from './mikro-tenant-provisioning.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）双轨**镜像断言**：与 `原租户开通仓储镜像测试`
 * 逐例对齐的非弱化断言。`submit` **不触任何 ORM**（沿用 BA createOrganization 系统动作·FR-12），
 * 迁移仅落 `remove`：旧 ORM `delete().where(eq(...)).returning()` → Mikro `em.nativeDelete(Organization,{id})`
 *（纯 SQL DELETE·FK cascade·R-B3 同律·>0 为实删）。`organization` 属 tenants 上下文，本类在
 * `modules/tenants/**` 内写自身 owned 表 → 写侧纪律天然合规。
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
  const em = { nativeDelete } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroTenantProvisioningRepository(mikro, authInstance),
    spies: { createOrganization, nativeDelete, fork },
  };
}

describe('MikroTenantProvisioningRepository (S-d2 · FR-1 唯一建租户通道)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submit() calls BA createOrganization as a system action, forcing pending_approval + applicant userId (no ORM touched)', async () => {
    const { repo, spies } = makeDeps();
    const receipt = await repo.submit('user-1', 'Acme', 'acme');

    const body = spies.createOrganization.mock.calls[0][0].body as Record<string, unknown>;
    expect(body.userId).toBe('user-1');
    expect(body.name).toBe('Acme');
    expect(body.slug).toBe('acme');
    expect((body.metadata as Record<string, unknown>).status).toBe(TENANT_STATUS.PENDING);
    expect(receipt).toEqual({ organizationId: 'org-new', status: TENANT_STATUS.PENDING });
    // submit 绝不开 em（不触 ORM 写）——迁移仅在 remove。
    expect(spies.fork).not.toHaveBeenCalled();
    expect(spies.nativeDelete).not.toHaveBeenCalled();
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

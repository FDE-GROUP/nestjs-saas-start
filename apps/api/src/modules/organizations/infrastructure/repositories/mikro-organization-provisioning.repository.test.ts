import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { AuthInstance, InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroOrganizationProvisioningRepository } from './mikro-organization-provisioning.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）· global-governance-lifecycle-consolidation 切片 B 归列后的镜像断言：
 * `submit` 两段——BA `createOrganization` 系统动作（FR-12·**BA 面不再携生命周期态**·org 落 DB 默认 'active'）+
 * 同流 `nativeUpdate(Organization,{id},{tenantId})` 盖章换轴写链（组织去审批化·不再手覆 pending）；
 * 专属 `Tenant` 行携 `status=pending_approval`（治理换轴 E-F·审批对象为租户准入态）。
 * `remove` 驳回 pending 申请＝`em.nativeDelete(Organization,{id})` + 连专属 `Tenant` 父行硬删（R-B3 同律·>0 为实删）。
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
  const em = { nativeDelete, nativeUpdate, findOne, create, flush } as unknown as Record<
    string,
    unknown
  >;
  // P0 D3：submit 我方两段写入 `em.transactional(cb)`——镜像以同 em 直执 cb（无真库事务·保行为可观测）。
  em.transactional = vi.fn((cb: (trx: unknown) => Promise<unknown>) => cb(em));
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

  it('submit() calls BA createOrganization as a system action and stamps tenantId (org 去审批化·pending 态上移 tenant)', async () => {
    const { repo, spies } = makeDeps();
    const receipt = await repo.submit('user-1', 'Acme', 'acme');

    const body = spies.createOrganization.mock.calls[0][0].body as Record<string, unknown>;
    expect(body.userId).toBe('user-1');
    expect(body.name).toBe('Acme');
    expect(body.slug).toBe('acme');
    // 归列后 BA 面零我方寄居键（status/appliedAt 全退场·判据②字面清零）
    expect(body).not.toHaveProperty('metadata');
    // 换轴写链：nativeUpdate organization 仅盖 tenantId（组织去审批化·不再写 status pending）·不盖 updatedAt。
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
    const [entity, where, data] = spies.nativeUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(Organization);
    expect(where).toEqual({ id: 'org-new' });
    expect(data).toEqual({ tenantId: 'org-new' });
    expect(receipt).toEqual({ organizationId: 'org-new', status: TENANT_STATUS.PENDING });
    expect(spies.nativeDelete).not.toHaveBeenCalled();
    // 治理换轴（E-F）：专属租户行携 pending_approval（审批对象）·id=orgId（1:1 骨架）。
    const tenantRows = spies.created.filter((c) => c.entity === Tenant);
    expect(tenantRows).toHaveLength(1);
    expect(tenantRows[0].row).toMatchObject({
      id: 'org-new',
      name: 'Acme',
      slug: 'acme',
      status: TENANT_STATUS.PENDING,
    });
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

  it('remove() nativeDeletes organization + owned tenant row → true on hit (驳回连租户硬删)', async () => {
    const { repo, spies } = makeDeps(1);
    expect(await repo.remove('org-1')).toBe(true);
    expect(spies.fork).toHaveBeenCalledTimes(1);
    // 治理换轴（E-F）：先删组织（子表 FK 级联）再删租户父行·两次 nativeDelete。
    expect(spies.nativeDelete).toHaveBeenCalledTimes(2);
    const [orgEntity, orgWhere] = spies.nativeDelete.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(orgEntity).toBe(Organization);
    expect(orgWhere).toEqual({ id: 'org-1' });
    const [tenantEntity, tenantWhere] = spies.nativeDelete.mock.calls[1] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(tenantEntity).toBe(Tenant);
    expect(tenantWhere).toEqual({ id: 'org-1' });
  });

  it('remove() → false on miss (idempotent·0 affected·不删租户)', async () => {
    const { repo, spies } = makeDeps(0);
    expect(await repo.remove('ghost')).toBe(false);
    expect(spies.nativeDelete).toHaveBeenCalledTimes(1);
  });

  // —— P0 D3· saga 孤儿补偿 + slug 竞 ——
  it('submit() slug 预检命中 → 409 Conflict（fail-fast·BA 未调·无孤儿可补）', async () => {
    const { repo, spies } = makeDeps();
    // 预检 findOne(Tenant,{slug}) 命中已存 slug → 直拒（在 BA 建本体前）。
    spies.findOne.mockResolvedValueOnce({ id: 'existing' });
    await expect(repo.submit('u', 'Acme', 'acme')).rejects.toBeInstanceOf(ConflictException);
    expect(spies.createOrganization).not.toHaveBeenCalled();
    expect(spies.nativeDelete).not.toHaveBeenCalled();
  });

  it('submit() 事务内 tenant_slug_unique 违例 → 补偿删孤儿 org + 译 409 Conflict', async () => {
    const { repo, spies } = makeDeps();
    // 事务回滚语义：transactional 内 flush 抛唯一违例 → catch 补偿。
    spies.flush.mockRejectedValueOnce(new Error('duplicate key value violates tenant_slug_unique'));
    await expect(repo.submit('u', 'Acme', 'acme')).rejects.toBeInstanceOf(ConflictException);
    // 孤儿补偿走 remove：nativeDelete org（命中>0）+ nativeDelete tenant。
    const entities = spies.nativeDelete.mock.calls.map((c) => c[0]);
    expect(entities).toEqual([Organization, Tenant]);
  });

  it('submit() 事务内非唯一违例异常 → 补偿删孤儿 org + 原样上抛', async () => {
    const { repo, spies } = makeDeps();
    spies.flush.mockRejectedValueOnce(new Error('connection reset'));
    await expect(repo.submit('u', 'Acme', 'acme')).rejects.toThrow(/connection reset/);
    const entities = spies.nativeDelete.mock.calls.map((c) => c[0]);
    expect(entities).toEqual([Organization, Tenant]);
  });
});

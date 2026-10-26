import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  Invitation,
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroOrganizationGovernanceRepository } from './mikro-organization-governance.repository';

/**
 * 切片 3c-ii-B 镜像断言（global-tenant-organization-rehierarchy 片一 治理台改锚 tenant）：平台目录/详情的
 * 准入态权威住 `tenant.status`——`listTenants`/`findTenantDetail` 先取**租户行**（findAndCount/findOne on Tenant），
 * 名下组织批量折叠计数/名册（`organization.tenantId ?? id` 回落含 1:1 骨架 + companion org）。fake `em` 经
 * `MikroOrmService.fork()` 供给。刻意**无租户上下文**（平台级天然全量·FR-11①·访问裁决在 controller guard）。
 */
function makeRepo() {
  const findAndCount = vi.fn().mockResolvedValue([[], 0]);
  const findOne = vi.fn().mockResolvedValue(null);
  const find = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const nativeDelete = vi.fn().mockResolvedValue(0);
  const em = { findAndCount, findOne, find, count, nativeDelete } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroOrganizationGovernanceRepository(mikro),
    spies: { fork, findAndCount, findOne, find, count, nativeDelete },
  };
}

const orgRow = {
  id: 'orgA',
  name: 'Acme',
  slug: 'acme',
  logo: null,
  // 归列后 organization 自带 status 真列（默认 active）；metadata 仅透传 BA 面内容
  status: ORGANIZATION_STATUS.ACTIVE,
  metadata: {},
  createdAt: new Date('2026-01-01'),
  updatedAt: null,
};

const tenantRow = {
  id: 't1',
  name: 'Acme',
  slug: 'acme',
  status: ORGANIZATION_STATUS.ACTIVE,
  createdAt: new Date('2026-01-01'),
};

describe('MikroOrganizationGovernanceRepository (S5 · FR-6 跨租户视图)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listTenants() 展租户行·批量计名下组织（一租多组织·含 1:1 骨架回落）·报告 total', async () => {
    const { repo, spies } = makeRepo();
    spies.findAndCount.mockResolvedValueOnce([
      [{ ...tenantRow, status: ORGANIZATION_STATUS.SUSPENDED }],
      3,
    ]);
    // 名下两组织：1:1 骨架（tenantId 自指）+ companion（tenantId='t1'）——准入态以租户为准（非恒 active）。
    spies.find.mockResolvedValueOnce([
      { id: 't1', tenantId: 't1' },
      { id: 'orgB', tenantId: 't1' },
    ]);
    const page = await repo.listTenants({ limit: 20, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.items[0]).toMatchObject({
      tenantId: 't1',
      name: 'Acme',
      slug: 'acme',
      status: ORGANIZATION_STATUS.SUSPENDED,
      organizationCount: 2,
    });
    expect(page).toMatchObject({ limit: 20, offset: 0 });
  });

  it('listTenants() 无本页组织 → organizationCount 0（find 不因空页集触发）', async () => {
    const { repo, spies } = makeRepo();
    spies.findAndCount.mockResolvedValueOnce([[tenantRow], 1]);
    const page = await repo.listTenants({ limit: 10, offset: 5 });
    expect(page.items[0].organizationCount).toBe(0);
  });

  it('listTenants() builds the $ilike search predicate over Tenant name/slug', async () => {
    const { repo, spies } = makeRepo();
    spies.findAndCount.mockResolvedValueOnce([[], 0]);
    const page = await repo.listTenants({ limit: 20, offset: 0, search: 'acme' });
    const [entity, where, options] = spies.findAndCount.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(Tenant);
    expect(where).toEqual({
      $or: [{ name: { $ilike: '%acme%' } }, { slug: { $ilike: '%acme%' } }],
    });
    expect(options).toMatchObject({
      orderBy: { createdAt: QueryOrder.DESC },
      limit: 20,
      offset: 0,
    });
    expect(page.items).toEqual([]);
  });

  it('findTenantDetail() returns null when the tenant is absent', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(null);
    await expect(repo.findTenantDetail('ghost')).resolves.toBeNull();
  });

  it('findTenantDetail() 折叠名下组织名册（1:1 骨架 + companion）·携 Odoo 绑定态·缺列兑底 active', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...tenantRow, status: ORGANIZATION_STATUS.SUSPENDED });
    spies.find.mockResolvedValueOnce([
      {
        id: 't1',
        name: 'Acme',
        slug: 'acme',
        status: undefined,
        odooCompanyId: 10,
        odooBindingStatus: 'ready',
        odooCompanyName: 'Acme Co',
      },
      {
        id: 'orgB',
        name: 'Acme EU',
        slug: 'acme-eu',
        status: ORGANIZATION_STATUS.ACTIVE,
        odooCompanyId: null,
        odooBindingStatus: null,
        odooCompanyName: null,
      },
    ]);
    const detail = await repo.findTenantDetail('t1');
    expect(spies.findOne).toHaveBeenCalledTimes(1);
    const [tenantEntity, tenantWhere] = spies.findOne.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(tenantEntity).toBe(Tenant);
    expect(tenantWhere).toEqual({ id: 't1' });
    expect(detail).toMatchObject({ tenantId: 't1', status: ORGANIZATION_STATUS.SUSPENDED });
    expect(detail?.organizations).toHaveLength(2);
    expect(detail?.organizations[0]).toMatchObject({
      organizationId: 't1',
      // 缺 status 列兑底 active（组织自有态·非准入态）
      status: ORGANIZATION_STATUS.ACTIVE,
      odooCompanyId: 10,
      odooBindingStatus: 'ready',
      odooCompanyName: 'Acme Co',
    });
    expect(detail?.organizations[1]).toMatchObject({
      organizationId: 'orgB',
      odooCompanyId: null,
      odooBindingStatus: null,
      odooCompanyName: null,
    });
  });

  it('diagnostics() returns null for an unknown tenant without counting', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(null);
    await expect(repo.diagnostics('ghost')).resolves.toBeNull();
    expect(spies.findOne).toHaveBeenCalledTimes(1);
    expect(spies.count).not.toHaveBeenCalled();
  });

  it('diagnostics() aggregates member/invitation/workspace/post counts', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(orgRow);
    spies.count
      .mockResolvedValueOnce(3) // member
      .mockResolvedValueOnce(1) // invitation
      .mockResolvedValueOnce(2) // workspace
      .mockResolvedValueOnce(9); // post
    const diag = await repo.diagnostics('orgA');
    expect(diag).toMatchObject({
      memberCount: 3,
      invitationCount: 1,
      workspaceCount: 2,
      postCount: 9,
    });
    expect(diag?.organization.organizationId).toBe('orgA');
    // 计数走 em.count（纯 COUNT(*)·不选列），依次四表。
    const countedEntities = spies.count.mock.calls.map((c) => c[0]);
    expect(countedEntities).toEqual([Member, Invitation, Workspace, PostEntity]);
  });
});

// ===== NFR-6 · 租户级数据导出 =====

describe('MikroOrganizationGovernanceRepository.exportOrganizationData (NFR-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  const memberRow = { id: 'mem1', role: 'owner', createdAt: new Date('2026-02-01'), userId: 'u1' };
  // 即便 fake user 行意外携带 password，输出投影面也不得出现凭据键（R-B1 红线）。
  const userRow = {
    id: 'u1',
    name: 'Ada',
    email: 'ada@acme.test',
    handle: 'ada',
    password: 'secret-hash',
  };

  function queueSixSections(spies: ReturnType<typeof makeRepo>['spies']) {
    spies.findOne.mockResolvedValueOnce(orgRow);
    spies.find
      .mockResolvedValueOnce([memberRow]) // Member
      .mockResolvedValueOnce([userRow]) // User (fields 投影·fake 仍带 password 验证被丢弃)
      .mockResolvedValueOnce([
        {
          id: 'inv1',
          email: 'be@acme.test',
          role: 'member',
          status: 'pending',
          expiresAt: new Date(),
          inviterId: 'u1',
          createdAt: new Date(),
        },
      ]) // Invitation
      .mockResolvedValueOnce([
        { id: 'ws1', name: 'Core', slug: 'core', createdAt: new Date(), updatedAt: new Date() },
      ]) // Workspace
      .mockResolvedValueOnce([
        {
          id: 'sub1',
          plan: 'free',
          status: 'active',
          seatsLimit: 5,
          storageQuota: null,
          apiQuota: null,
          periodStart: new Date(),
          periodEnd: null,
          provider: null,
          providerCustomerId: null,
          providerSubscriptionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]) // OrganizationSubscription
      .mockResolvedValueOnce([
        {
          id: 'p1',
          title: 'Hello',
          content: null,
          published: false,
          workspaceId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]); // Post
  }

  it('assembles the six-section payload with nested minimal user face', async () => {
    const { repo, spies } = makeRepo();
    queueSixSections(spies);
    const payload = await repo.exportOrganizationData('orgA');
    expect(spies.findOne).toHaveBeenCalledTimes(1); // 归列·本体单查即携 status 真列
    expect(spies.find).toHaveBeenCalledTimes(6); // member/user/invitation/workspace/subscription/post
    expect(payload).not.toBeNull();
    expect(payload?.organization).toMatchObject({
      id: 'orgA',
      name: 'Acme',
      slug: 'acme',
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(payload?.members).toEqual([
      {
        id: 'mem1',
        role: 'owner',
        createdAt: memberRow.createdAt,
        user: { id: 'u1', name: 'Ada', email: 'ada@acme.test', handle: 'ada' },
      },
    ]);
    expect(payload?.invitations).toHaveLength(1);
    expect(payload?.workspaces).toHaveLength(1);
    expect(payload?.subscriptions).toHaveLength(1);
    expect(payload?.posts).toHaveLength(1);
  });

  it('R-B1: user projection selects only id/name/email/handle (credentials excluded at the SELECT face)', async () => {
    const { repo, spies } = makeRepo();
    queueSixSections(spies);
    await repo.exportOrganizationData('orgA');
    const userCall = spies.find.mock.calls.find((c) => c[0] === User);
    expect(userCall).toBeDefined();
    const options = userCall?.[2] as { fields: string[] };
    expect(options.fields).toEqual(['id', 'name', 'email', 'handle']);
    expect(options.fields).not.toContain('password');
  });

  it('red line: serialized payload contains no credential keys', async () => {
    const { repo, spies } = makeRepo();
    queueSixSections(spies);
    const payload = await repo.exportOrganizationData('orgA');
    const json = JSON.stringify(payload);
    for (const forbidden of ['password', 'accessToken', 'refreshToken', 'idToken', 'evidence']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('drops a member whose user row is missing (对齐旧实现 innerJoin 语义)', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(orgRow);
    spies.find
      .mockResolvedValueOnce([{ ...memberRow, userId: 'ghost-user' }]) // Member 引用不存在的 user
      .mockResolvedValueOnce([]) // User 批量取回空
      .mockResolvedValueOnce([]) // Invitation
      .mockResolvedValueOnce([]) // Workspace
      .mockResolvedValueOnce([]) // Subscription
      .mockResolvedValueOnce([]); // Post
    const payload = await repo.exportOrganizationData('orgA');
    expect(payload?.members).toEqual([]);
  });

  it('exports a deleted-terminal tenant (S5 取证用途·no status filter)', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...orgRow, status: ORGANIZATION_STATUS.DELETED });
    spies.find.mockResolvedValue([]);
    const payload = await repo.exportOrganizationData('orgA');
    // 终态直读 organization.status 真列（非 metadata）；metadata 全列透传（零我方键）
    expect(payload?.organization.status).toBe(ORGANIZATION_STATUS.DELETED);
    expect(payload?.organization.metadata).toEqual({});
  });

  it('returns null for an unknown tenant without touching the other tables', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(null);
    await expect(repo.exportOrganizationData('ghost')).resolves.toBeNull();
    expect(spies.findOne).toHaveBeenCalledTimes(1); // 本体短路·不触户籍查
    expect(spies.find).not.toHaveBeenCalled();
  });
});

describe('MikroOrganizationGovernanceRepository.destroyTenant (NFR-6 硬删连带)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('租户连带硬删 → 先清名下所有组织（nativeDelete $in·子表 FK cascade）+ 租户本体（订阅随租户 FK cascade）·返 purgedOrgs', async () => {
    const { repo, spies } = makeRepo();
    spies.find.mockResolvedValueOnce([{ id: 't1' }, { id: 'orgB' }]);
    // 首个 nativeDelete（Organization）回 2 实删行→ purgedOrgs=2；后一删（本体）回 0（不取）。
    spies.nativeDelete.mockResolvedValueOnce(2).mockResolvedValue(0);
    await expect(repo.destroyTenant('t1')).resolves.toEqual({ purgedOrgs: 2 });
    const calls = spies.nativeDelete.mock.calls as [unknown, Record<string, unknown>][];
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(Organization);
    expect(calls[0][1]).toEqual({ id: { $in: ['t1', 'orgB'] } });
    expect(calls[1][0]).toBe(Tenant);
    expect(calls[1][1]).toEqual({ id: 't1' });
  });

  it('名下无组织 → purgedOrgs 0（Organization nativeDelete 不触发·仅本体一删·订阅随 FK cascade）', async () => {
    const { repo, spies } = makeRepo();
    spies.find.mockResolvedValueOnce([]);
    spies.nativeDelete.mockResolvedValue(0);
    await expect(repo.destroyTenant('ghost')).resolves.toEqual({ purgedOrgs: 0 });
    expect(spies.nativeDelete).toHaveBeenCalledTimes(1);
    const entities = spies.nativeDelete.mock.calls.map((c) => c[0]);
    expect(entities).toEqual([Tenant]);
  });
});

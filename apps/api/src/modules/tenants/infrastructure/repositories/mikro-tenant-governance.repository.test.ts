import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import {
  Invitation,
  Member,
  Organization,
} from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tenant } from '../entities/tenant.entity';
import { MikroTenantGovernanceRepository } from './mikro-tenant-governance.repository';

/**
 * 切片 3c-ii-B 镜像断言（global-tenant-entity-reclamation 切片 B 换轨后）：状态源从
 * `organization.metadata` 迁至 `tenant.status` 真列——列表批量取（find Tenant）/单查户籍
 * （findOne Tenant），无户籍兑底 active 语义逐字不变。fake `em` 经 `MikroOrmService.fork()`
 * 供给。刻意**无租户上下文**（平台级天然全量·FR-11①·访问裁决在 controller guard）。
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
    repo: new MikroTenantGovernanceRepository(mikro),
    spies: { fork, findAndCount, findOne, find, count, nativeDelete },
  };
}

const orgRow = {
  id: 'orgA',
  name: 'Acme',
  slug: 'acme',
  logo: null,
  // 收权后 metadata 仅透传 BA 面内容（我方寄居键 status/appliedAt 全退场）
  metadata: {},
  createdAt: new Date('2026-01-01'),
  updatedAt: null,
};
const tenantRow = { id: 'orgA', status: TENANT_STATUS.SUSPENDED };

describe('MikroTenantGovernanceRepository (S5 · FR-6 跨租户视图)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() maps rows, coerces unregistered (无户籍) status → active, and reports total', async () => {
    const { repo, spies } = makeRepo();
    spies.findAndCount.mockResolvedValueOnce([[{ ...orgRow, metadata: null }], 7]);
    // find(Tenant) 缺省回 []：无户籍 → 兑底 active
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(page.total).toBe(7);
    expect(page.items[0]).toMatchObject({
      organizationId: 'orgA',
      name: 'Acme',
      slug: 'acme',
      status: TENANT_STATUS.ACTIVE,
    });
    expect(page).toMatchObject({ limit: 20, offset: 0 });
  });

  it('list() preserves an explicit lifecycle status from the tenant registry (一页一查批量取)', async () => {
    const { repo, spies } = makeRepo();
    spies.findAndCount.mockResolvedValueOnce([[orgRow], 1]);
    spies.find.mockImplementationOnce(async (entity: unknown) =>
      entity === Tenant ? [{ id: 'orgA', status: TENANT_STATUS.SUSPENDED }] : [],
    );
    const page = await repo.list({ limit: 10, offset: 5 });
    expect(page.items[0].status).toBe(TENANT_STATUS.SUSPENDED);
    const tenantCall = spies.find.mock.calls.find((c) => c[0] === Tenant);
    expect(tenantCall?.[1]).toEqual({ id: { $in: ['orgA'] } });
  });

  it('list() builds the $ilike search predicate over name/slug', async () => {
    const { repo, spies } = makeRepo();
    const page = await repo.list({ limit: 20, offset: 0, search: 'acme' });
    const [entity, where, options] = spies.findAndCount.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(Organization);
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

  it('findById() returns null when the row is absent', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(null);
    await expect(repo.findById('ghost')).resolves.toBeNull();
  });

  it('findById() issues one org lookup + one registry lookup and maps the row', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne
      .mockResolvedValueOnce(orgRow) // 本体
      .mockResolvedValueOnce(tenantRow); // 户籍
    const row = await repo.findById('orgA');
    expect(spies.findOne).toHaveBeenCalledTimes(2);
    const [orgEntity, orgWhere] = spies.findOne.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(orgEntity).toBe(Organization);
    expect(orgWhere).toEqual({ id: 'orgA' });
    expect(spies.findOne.mock.calls[1][0]).toBe(Tenant);
    expect(row).toMatchObject({ organizationId: 'orgA', status: TENANT_STATUS.SUSPENDED });
  });

  it('findById() coerces a missing registry row to active（存量无户籍兑底）', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(orgRow).mockResolvedValueOnce(null);
    const row = await repo.findById('orgA');
    expect(row?.status).toBe(TENANT_STATUS.ACTIVE);
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
    expect(diag?.tenant.organizationId).toBe('orgA');
    // 计数走 em.count（纯 COUNT(*)·不选列），依次四表。
    const countedEntities = spies.count.mock.calls.map((c) => c[0]);
    expect(countedEntities).toEqual([Member, Invitation, Workspace, PostEntity]);
  });
});

// ===== NFR-6 · 租户级数据导出 =====

describe('MikroTenantGovernanceRepository.exportTenantData (NFR-6)', () => {
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
      ]) // TenantSubscription
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
    spies.findOne.mockResolvedValueOnce(tenantRow); // 户籍态二查（队列首查为 org 本体）
    const payload = await repo.exportTenantData('orgA');
    expect(spies.findOne).toHaveBeenCalledTimes(2); // 本体存在性 + 户籍态分取
    expect(spies.find).toHaveBeenCalledTimes(6); // member/user/invitation/workspace/subscription/post
    expect(payload).not.toBeNull();
    expect(payload?.tenant).toMatchObject({
      id: 'orgA',
      name: 'Acme',
      slug: 'acme',
      status: TENANT_STATUS.SUSPENDED,
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
    await repo.exportTenantData('orgA');
    const userCall = spies.find.mock.calls.find((c) => c[0] === User);
    expect(userCall).toBeDefined();
    const options = userCall?.[2] as { fields: string[] };
    expect(options.fields).toEqual(['id', 'name', 'email', 'handle']);
    expect(options.fields).not.toContain('password');
  });

  it('red line: serialized payload contains no credential keys', async () => {
    const { repo, spies } = makeRepo();
    queueSixSections(spies);
    const payload = await repo.exportTenantData('orgA');
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
    const payload = await repo.exportTenantData('orgA');
    expect(payload?.members).toEqual([]);
  });

  it('exports a deleted-terminal tenant (S5 取证用途·no status filter)', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne
      .mockResolvedValueOnce(orgRow)
      .mockResolvedValueOnce({ id: 'orgA', status: TENANT_STATUS.DELETED });
    spies.find.mockResolvedValue([]);
    const payload = await repo.exportTenantData('orgA');
    // 终态取户籍行（非 metadata）；metadata 全列透传（零我方键）
    expect(payload?.tenant.status).toBe(TENANT_STATUS.DELETED);
    expect(payload?.tenant.metadata).toEqual({});
  });

  it('returns null for an unknown tenant without touching the other tables', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(null);
    await expect(repo.exportTenantData('ghost')).resolves.toBeNull();
    expect(spies.findOne).toHaveBeenCalledTimes(1); // 本体短路·不触户籍查
    expect(spies.find).not.toHaveBeenCalled();
  });
});

describe('MikroTenantGovernanceRepository.destroy (NFR-6 硬删主行)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('主行实删 → true（nativeDelete 单一卡点，子表由 DB FK cascade·不逐表删·不预查）', async () => {
    const { repo, spies } = makeRepo();
    spies.nativeDelete.mockResolvedValueOnce(1);
    await expect(repo.destroy('orgA')).resolves.toBe(true);
    expect(spies.nativeDelete).toHaveBeenCalledTimes(1);
    const [entity, where] = spies.nativeDelete.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entity).toBe(Organization);
    expect(where).toEqual({ id: 'orgA' });
    expect(spies.findOne).not.toHaveBeenCalled();
    expect(spies.find).not.toHaveBeenCalled();
    expect(spies.count).not.toHaveBeenCalled();
  });

  it('行不存在 → false（幂等·0 affected）', async () => {
    const { repo, spies } = makeRepo();
    spies.nativeDelete.mockResolvedValueOnce(0);
    await expect(repo.destroy('ghost')).resolves.toBe(false);
  });
});

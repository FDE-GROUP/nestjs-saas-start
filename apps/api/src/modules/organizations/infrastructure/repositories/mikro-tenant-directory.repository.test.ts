import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroTenantDirectoryRepository } from './mikro-tenant-directory.repository';

/**
 * 租户目录读适配测（rehierarchy 切片 E-F）：锁「成员组织按派生租户归组」的核心语义——
 * 同租多组织并入一条目、跨租分列、无成员返回空、expand 段未盖章组织（tenantId 缺席）回落自身 id 作
 * 1:1 租户替身（绝不误并他租）。fake `em.find` 按实体分派返回集。
 */
function makeRepo(handlers: {
  members?: { organizationId: string }[];
  orgs?: { id: string; name: string; slug: string; tenantId: string | null; status: string }[];
  tenants?: { id: string; name: string; slug: string; status: string }[];
}) {
  const find = vi.fn(async (entity: unknown) => {
    if (entity === Member) return handlers.members ?? [];
    if (entity === Organization) return handlers.orgs ?? [];
    if (entity === Tenant) return handlers.tenants ?? [];
    return [];
  });
  const em = { find } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return { repo: new MikroTenantDirectoryRepository(mikro), find };
}

describe('MikroTenantDirectoryRepository · listForUser 归组语义', () => {
  beforeEach(() => vi.clearAllMocks());

  it('同租多组织并入一条目（顶层租户 + 二级组织集合）', async () => {
    const { repo } = makeRepo({
      members: [{ organizationId: 'o1' }, { organizationId: 'o2' }],
      orgs: [
        { id: 'o1', name: 'Org 1', slug: 'org-1', tenantId: 't1', status: 'active' },
        { id: 'o2', name: 'Org 2', slug: 'org-2', tenantId: 't1', status: 'active' },
      ],
      tenants: [{ id: 't1', name: 'Tenant 1', slug: 'tenant-1', status: 'active' }],
    });
    const result = await repo.listForUser('u1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ tenantId: 't1', name: 'Tenant 1', status: 'active' });
    expect(result[0]?.organizations.map((o) => o.organizationId)).toEqual(['o1', 'o2']);
  });

  it('跨租分列各条目', async () => {
    const { repo } = makeRepo({
      members: [{ organizationId: 'o1' }, { organizationId: 'o2' }],
      orgs: [
        { id: 'o1', name: 'Org 1', slug: 'org-1', tenantId: 't1', status: 'active' },
        { id: 'o2', name: 'Org 2', slug: 'org-2', tenantId: 't2', status: 'pending_approval' },
      ],
      tenants: [
        { id: 't1', name: 'Tenant 1', slug: 'tenant-1', status: 'active' },
        { id: 't2', name: 'Tenant 2', slug: 'tenant-2', status: 'pending_approval' },
      ],
    });
    const result = await repo.listForUser('u1');
    expect(result.map((e) => e.tenantId).sort()).toEqual(['t1', 't2']);
  });

  it('无成员资格返回空数组（仍 fork 一次取 member·无 org 即早退不查他表）', async () => {
    const { repo, find } = makeRepo({ members: [] });
    const result = await repo.listForUser('u1');
    expect(result).toEqual([]);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('expand 段未盖章组织（tenantId 缺席）回落自身 id 作 1:1 租户替身·准入态取自租户行', async () => {
    const { repo } = makeRepo({
      members: [{ organizationId: 'oNew' }],
      orgs: [{ id: 'oNew', name: 'Fresh Org', slug: 'fresh', tenantId: null, status: 'active' }],
      // 切片 6 D3：组织自有态列已 DROP，准入态单一锥归位 `tenant.status`——1:1 骨架经 org.id 命中租户行取态。
      tenants: [{ id: 'oNew', name: 'Fresh Org', slug: 'fresh', status: 'pending_approval' }],
    });
    const result = await repo.listForUser('u1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      tenantId: 'oNew',
      name: 'Fresh Org',
      status: 'pending_approval',
    });
    expect(result[0]?.organizations[0]).toMatchObject({ organizationId: 'oNew' });
  });
});

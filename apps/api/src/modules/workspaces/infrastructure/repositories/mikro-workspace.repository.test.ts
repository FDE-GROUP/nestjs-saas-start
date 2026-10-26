import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  WORKSPACE_META,
  Workspace,
} from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroWorkspaceRepository } from './mikro-workspace.repository';

/**
 * 切片 3c-ii-A 双轨**镜像断言**：与 `原工作区仓储镜像测试` 同一套隔离律（S3 · FR-5 卡点），
 * 只是把旧 ORM 谓词对象换成 Mikro `FilterQuery` 平面对象。fake `em` 由 `MikroOrmService.fork()` 供给——
 * 关键不变量：`requireActiveTenantId()` fail-closed **先于** `fork()`（无租户→403 且绝不取 em/查库）。
 * rehierarchy 切片 C 换轴：读谓词锚主轴 `tenantId`（同租跨组织互见）·写路径双盖章 `tenantId + organizationId`。
 */
function makeRepo(organizationId: string | null) {
  const requireActiveOrganizationId = vi.fn(() => {
    if (!organizationId) throw new ForbiddenException('Missing active organization context');
    return organizationId;
  });
  // 主轴派生（活动组织 → 其 tenantId）·无归属即 fail-closed（先于组织轴调用）。
  const requireActiveTenantId = vi.fn(() => {
    if (!organizationId) throw new ForbiddenException('No active tenant context');
    return `tenant-${organizationId}`;
  });
  const tenant = {
    requireActiveOrganizationId,
    requireActiveTenantId,
  } as unknown as TenantIsolationService;

  const findAndCount = vi.fn().mockResolvedValue([[], 0]);
  const findOne = vi.fn().mockResolvedValue(null);
  const create = vi.fn((_entity: unknown, data: Record<string, unknown>) => data);
  const flush = vi.fn().mockResolvedValue(undefined);
  const persist = vi.fn(() => ({ flush }));
  const nativeDelete = vi.fn().mockResolvedValue(0);
  const em = {
    findAndCount,
    findOne,
    create,
    persist,
    flush,
    nativeDelete,
  } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;

  return {
    repo: new MikroWorkspaceRepository(mikro, tenant),
    spies: {
      requireActiveOrganizationId,
      requireActiveTenantId,
      fork,
      findAndCount,
      findOne,
      create,
      persist,
      flush,
      nativeDelete,
    },
  };
}

describe('MikroWorkspaceRepository · tenant isolation (S3 · FR-5 choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: every method refuses and never forks an em when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.list({ limit: 20, offset: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.create({ name: 'n', slug: 's' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.update('w1', { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.remove('w1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.fork).not.toHaveBeenCalled();
    expect(spies.findAndCount).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.nativeDelete).not.toHaveBeenCalled();
  });

  it('list() ALWAYS filters by the active tenant (red if the tenantId is dropped)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list({ limit: 10, offset: 5 });
    expect(spies.findAndCount).toHaveBeenCalledTimes(1);
    const [entity, where, options] = spies.findAndCount.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(Workspace);
    expect(where).toEqual({ tenantId: 'tenant-orgA' });
    expect(options).toMatchObject({
      limit: 10,
      offset: 5,
      orderBy: { createdAt: QueryOrder.ASC },
    });
  });

  it('list() 合并授权谓词：固定展开序使 tenantId 不可被覆盖（切片 C·FR-5 卡点锁测）', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list(
      { limit: 10, offset: 0 },
      {
        tenantId: 'tenantEvil',
        $or: [{ ownerId: 'u9' }, { teamId: { $in: ['t1', 't2'] } }],
      },
    );
    const [, where] = spies.findAndCount.mock.calls[0] as [unknown, Record<string, unknown>];
    // 盖章恒为最后键：授权侧伪造的 tenantId（主轴）被结构性覆盖，实例谓词原样保留。
    expect(where).toEqual({
      tenantId: 'tenant-orgA',
      $or: [{ ownerId: 'u9' }, { teamId: { $in: ['t1', 't2'] } }],
    });
  });

  it('list() returns the Page<T> envelope via createPage (治理面同形)', async () => {
    const { repo, spies } = makeRepo('orgA');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const entities = [
      { id: 'w1', name: 'A', slug: 'a', organizationId: 'orgA', createdAt, updatedAt },
    ];
    spies.findAndCount.mockResolvedValueOnce([entities, 42]);

    const page = await repo.list({ limit: 10, offset: 5 });

    expect(page).toEqual({
      // toRecord 恒带 ownerId 键（入参 entities 无该列 → null·module-workspace-owner-column 接线后信封形）。
      items: [
        {
          id: 'w1',
          name: 'A',
          slug: 'a',
          organizationId: 'orgA',
          ownerId: null,
          createdAt,
          updatedAt,
        },
      ],
      total: 42,
      limit: 10,
      offset: 5,
    });
  });

  it('create() stamps the active tenant + organization regardless of the draft', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create({ name: 'Design', slug: 'design' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.tenantId).toBe('tenant-orgA');
    expect(data.organizationId).toBe('orgA');
    expect(spies.persist).toHaveBeenCalled();
    expect(spies.flush).toHaveBeenCalled();
  });

  // 实例属主接线（module-workspace-owner-column 切片 α）：值透传/缺省落 NULL，与租户盖章互不干扰。
  it('create() 透传 draft.ownerId（可信会话盖章值·非 body 面）', async () => {
    const { repo, spies } = makeRepo('orgA');
    const record = await repo.create({ name: 'Design', slug: 'design', ownerId: 'u9' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.ownerId).toBe('u9');
    expect(data.organizationId).toBe('orgA');
    expect(record.ownerId).toBe('u9');
  });

  it('create() 无 ownerId → 列落 null（人裁② fail-closed 语义·非缺键）', async () => {
    const { repo, spies } = makeRepo('orgA');
    const record = await repo.create({ name: 'Design', slug: 'design' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.ownerId).toBeNull();
    expect(record.ownerId).toBeNull();
  });

  it('update() scopes by BOTH id and tenant → foreign id resolves null → returns null', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.findOne.mockResolvedValue(null);
    const result = await repo.update('w1', { name: 'Renamed' });
    const [, where] = spies.findOne.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'w1', tenantId: 'tenant-orgA' });
    expect(result).toBeNull();
  });

  it('update() with a real row mutates within-tenant and stamps updatedAt', async () => {
    const { repo, spies } = makeRepo('orgA');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    spies.findOne.mockResolvedValue({
      id: 'w1',
      name: 'A',
      slug: 'a',
      organizationId: 'orgA',
      createdAt,
      updatedAt,
    });
    const result = await repo.update('w1', { name: 'Renamed' });
    expect(result).toMatchObject({ id: 'w1', name: 'Renamed', organizationId: 'orgA' });
    expect(spies.flush).toHaveBeenCalled();
  });

  it('update() with an empty draft does not flush (no timestamp bump)', async () => {
    const { repo, spies } = makeRepo('orgA');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    spies.findOne.mockResolvedValue({
      id: 'w1',
      name: 'A',
      slug: 'a',
      organizationId: 'orgA',
      createdAt,
      updatedAt,
    });
    const result = await repo.update('w1', {});
    expect(result).toMatchObject({ id: 'w1', name: 'A' });
    expect(spies.flush).not.toHaveBeenCalled();
  });

  it('remove() scopes by BOTH id and tenant', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.nativeDelete.mockResolvedValueOnce(1);
    const ok = await repo.remove('w1');
    const [, where] = spies.nativeDelete.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'w1', tenantId: 'tenant-orgA' });
    expect(ok).toBe(true);
  });

  it('remove() returns false when the row is not in the active tenant (0 affected)', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.nativeDelete.mockResolvedValueOnce(0);
    expect(await repo.remove('foreign')).toBe(false);
  });
});

describe('WORKSPACE_META · 实例属主列单一源派生（module-workspace-owner-column 切片 α）', () => {
  it('列定义含 ownerId（text·可空）且复合索引 (organizationId, ownerId) 就位', () => {
    const owner = WORKSPACE_META.columns.find(([name]) => name === 'ownerId');
    expect(owner).toBeDefined();
    expect(owner?.[1]).toEqual({ k: 'text', nullable: true });
    expect(WORKSPACE_META.indexes).toContainEqual({
      name: 'workspace_org_owner_idx',
      properties: ['organizationId', 'ownerId'],
    });
    // 既有唯一索引不受扰动（人裁④）。
    expect(WORKSPACE_META.uniques).toContainEqual({
      name: 'workspace_org_slug_idx',
      properties: ['organizationId', 'slug'],
    });
  });

  // 派生保真不在本例集内做运行时自省（EntitySchema 无公开 introspection API）：
  // 运行时实体形状由 companion `interface Workspace.ownerId` + TS 编译闸兜（本文件上方
  // create 透传两例即消费面实证），迁移变体同源性由 `migration-entities.ts` 消费同一
  // WORKSPACE_META 的结构事实 + 切片 α 生成工件的 DDL 对拍兼顾（module-workspace-owner-column）。
});

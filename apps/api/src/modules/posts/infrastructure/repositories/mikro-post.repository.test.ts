import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Post } from '@app/modules/posts/domain/entities/post';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { encodeCursor } from '@core/saas-kit/shared-kernel/domain/pagination';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroPostRepository } from './mikro-post.repository';

/**
 * 切片 2 双轨**镜像断言** + 就绪预备切片 B（游标分页）：posts 隔离律不变（S2 FR-5 / S3 D2·§8-6），
 * `list` 由 offset(`findAndCount`) 换为 keyset(`find` limit+1 探页)。fake `em` 由 `MikroOrmService.fork()`
 * 供给——关键不变量：`requireActiveTenantId()` fail-closed **先于** `fork()`（无租户→403 且绝不取 em/查库）。
 * rehierarchy 切片 C 换轴：读谓词锚主轴 `tenantId`（同租跨组织互见）·写路径双盖章 `tenantId + organizationId`。
 */
function makeRepo(organizationId: string | null, workspaceId?: string) {
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
    workspaceId,
  } as unknown as TenantIsolationService;

  const find = vi.fn().mockResolvedValue([]);
  const findOne = vi.fn().mockResolvedValue(null);
  const create = vi.fn((_entity: unknown, data: Record<string, unknown>) => data);
  const flush = vi.fn().mockResolvedValue(undefined);
  const persist = vi.fn(() => ({ flush }));
  const em = { find, findOne, create, persist } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;

  return {
    repo: new MikroPostRepository(mikro, tenant),
    spies: {
      requireActiveOrganizationId,
      requireActiveTenantId,
      fork,
      find,
      findOne,
      create,
      persist,
      flush,
    },
  };
}

function postEntity(id: string, createdAt: Date) {
  return {
    id,
    title: 'T',
    content: null,
    published: false,
    organizationId: 'orgA',
    workspaceId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('MikroPostRepository · tenant isolation (S2 · FR-5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: list() refuses and never forks an em when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.list({ limit: 20 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.fork).not.toHaveBeenCalled();
    expect(spies.find).not.toHaveBeenCalled();
  });

  it('list() first page ALWAYS filters by the active tenant + peeks limit+1 (no cursor)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list({ limit: 10 });
    expect(spies.find).toHaveBeenCalledTimes(1);
    const [entity, where, options] = spies.find.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(PostEntity);
    // 首页无 cursor：谓词即裸租户主轴对象（tenantId 必含·去之则回归红）
    expect(where).toEqual({ tenantId: 'tenant-orgA' });
    expect(options).toMatchObject({
      limit: 11, // request.limit + 1（探页·免 COUNT）
      orderBy: { id: QueryOrder.DESC },
    });
  });

  it('findById() scopes by BOTH id and tenant (no cross-tenant id leak)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.findById('p1');
    const [, where] = spies.findOne.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'p1', tenantId: 'tenant-orgA' });
  });

  it('create() stamps the active tenant + organization regardless of the draft', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create(Post.draft({ title: 'hi' }));
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.tenantId).toBe('tenant-orgA');
    expect(data.organizationId).toBe('orgA');
    expect(spies.persist).toHaveBeenCalled();
    expect(spies.flush).toHaveBeenCalled();
  });

  it('create() refuses when no tenant is bound (never forks)', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.create(Post.draft({ title: 'hi' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(spies.fork).not.toHaveBeenCalled();
  });
});

describe('MikroPostRepository · compound workspace scope (S3 · D2/§8-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() with an active workspace narrows the tenant filter by workspaceId', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.list({ limit: 20 });
    const [, where] = spies.find.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ tenantId: 'tenant-orgA', workspaceId: 'wsA1' });
  });

  it('list() without a workspace selector stays tenant-scoped (no workspace clause)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list({ limit: 20 });
    const [, where] = spies.find.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ tenantId: 'tenant-orgA' });
  });

  it('findById() with a workspace scopes by id + tenant + workspace (互不可见)', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.findById('p1');
    const [, where] = spies.findOne.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'p1', tenantId: 'tenant-orgA', workspaceId: 'wsA1' });
  });

  it('create() stamps BOTH the trusted tenant and the active workspace', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.create(Post.draft({ title: 'hi' }));
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.tenantId).toBe('tenant-orgA');
    expect(data.organizationId).toBe('orgA');
    expect(data.workspaceId).toBe('wsA1');
  });

  it('create() with no workspace selector stamps workspaceId = null (tenant-level row)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create(Post.draft({ title: 'hi' }));
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.tenantId).toBe('tenant-orgA');
    expect(data.organizationId).toBe('orgA');
    expect(data.workspaceId).toBeNull();
  });
});

describe('MikroPostRepository · 游标分页语义（就绪预备切片 B）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('多取一条 → hasMore=true 且 nextCursor=末项 id 单键（items 裁至 limit）', async () => {
    const { repo, spies } = makeRepo('orgA');
    const e1 = postEntity('p1', new Date('2026-01-03T00:00:00.000Z'));
    const e2 = postEntity('p2', new Date('2026-01-02T00:00:00.000Z'));
    const e3 = postEntity('p3', new Date('2026-01-01T00:00:00.000Z')); // peek 触发 hasMore
    spies.find.mockResolvedValueOnce([e1, e2, e3]);

    const page = await repo.list({ limit: 2 });

    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(2);
    expect(page.items.map((i) => i.id)).toEqual(['p1', 'p2']);
    expect(page.nextCursor).toBe(encodeCursor({ id: 'p2' }));
  });

  it('取不满 limit → hasMore=false 且无 nextCursor 键', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.find.mockResolvedValueOnce([postEntity('p1', new Date('2026-01-01T00:00:00.000Z'))]);

    const page = await repo.list({ limit: 5 });

    expect(page.hasMore).toBe(false);
    expect(page.items).toHaveLength(1);
    expect('nextCursor' in page).toBe(false);
  });

  it('空结果集 → hasMore=false·items 空', async () => {
    const { repo } = makeRepo('orgA');
    const page = await repo.list({ limit: 10 });
    expect(page).toEqual({ items: [], hasMore: false });
  });

  it('续页 cursor → id 单键 keyset 谓词 $and[tenant, {id<cursorId}]', async () => {
    const { repo, spies } = makeRepo('orgA');
    const cursor = encodeCursor({ id: 'p2' });

    await repo.list({ limit: 3, cursor });

    const [, where, options] = spies.find.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(options).toMatchObject({ limit: 4, orderBy: { id: QueryOrder.DESC } });
    expect(where).toEqual({
      $and: [{ tenantId: 'tenant-orgA' }, { id: { $lt: 'p2' } }],
    });
  });

  it('续页 + workspace → 谓词租户段携 workspaceId', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    const cursor = encodeCursor({ id: 'p2' });

    await repo.list({ limit: 3, cursor });

    const call = spies.find.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    const segments = call[1].$and as Record<string, unknown>[];
    expect(segments[0]).toEqual({ tenantId: 'tenant-orgA', workspaceId: 'wsA1' });
  });

  it('畸形 cursor（合法 base64url·载荷非 [id]）→ BadRequestException 且先于 fork（不查库）', async () => {
    const { repo, spies } = makeRepo('orgA');
    const bogus = Buffer.from(JSON.stringify({ nope: 1 })).toString('base64url');

    await expect(repo.list({ limit: 3, cursor: bogus })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(spies.fork).not.toHaveBeenCalled();
    expect(spies.find).not.toHaveBeenCalled();
  });
});

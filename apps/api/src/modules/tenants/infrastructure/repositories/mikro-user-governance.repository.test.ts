import { User } from '@app/database/ba/entities';
import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { UserStatus } from '@app/modules/tenants/infrastructure/entities/user-status.entity';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroUserGovernanceRepository } from './mikro-user-governance.repository';

/**
 * 切片 3c-ii-B 双轨**镜像断言**：与 `原用户治理仓储镜像测试` 同一套读语义
 *（S6 · FR-6/FR-10 跨平台用户视图·无状态记录视同 active），只是把旧 ORM 的 `LEFT JOIN user_status`
 * 单查折叠成 Mikro 的「`findAndCount(User)` + `find(UserStatus, $in)` 批量拼接」。fake `em` 经
 * `MikroOrmService.fork()` 供给。刻意**无租户上下文**（平台级天然全量·FR-11①）。
 */
function makeRepo(opts: { users?: unknown[]; total?: number; statuses?: unknown[] } = {}) {
  const findAndCount = vi.fn().mockResolvedValue([opts.users ?? [], opts.total ?? 0]);
  const find = vi.fn().mockResolvedValue(opts.statuses ?? []);
  const findOne = vi.fn().mockResolvedValue(null);
  const count = vi.fn().mockResolvedValue(0);
  const nativeDelete = vi.fn().mockResolvedValue(0);
  const em = { findAndCount, find, findOne, count, nativeDelete } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroUserGovernanceRepository(mikro),
    spies: { fork, findAndCount, find, findOne, count, nativeDelete },
  };
}

describe('MikroUserGovernanceRepository (S6 · FR-6/FR-10 跨平台用户视图)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() maps rows, coerces a missing status (无 user_status 记录) → active, reports total', async () => {
    const users = [
      { id: 'u1', name: 'Ann', email: 'ann@x.com', createdAt: new Date('2026-01-01') },
    ];
    const { repo } = makeRepo({ users, total: 12, statuses: [] });
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(page.total).toBe(12);
    expect(page.items[0]).toMatchObject({
      userId: 'u1',
      name: 'Ann',
      email: 'ann@x.com',
      status: TENANT_STATUS.ACTIVE,
    });
    expect(page).toMatchObject({ limit: 20, offset: 0 });
  });

  it('list() preserves an explicit suspended status from the batched user_status lookup', async () => {
    const users = [
      { id: 'u2', name: 'Bob', email: 'bob@x.com', createdAt: new Date('2026-02-01') },
    ];
    const { repo, spies } = makeRepo({
      users,
      total: 1,
      statuses: [{ userId: 'u2', status: 'suspended' }],
    });
    const page = await repo.list({ limit: 10, offset: 0, search: 'bob' });
    expect(page.items[0].status).toBe(TENANT_STATUS.SUSPENDED);
    // 状态以本页 id 批量取（$in），不逐用户 N+1。
    const [entity, where] = spies.find.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entity).toBe(UserStatus);
    expect(where).toEqual({ userId: { $in: ['u2'] } });
  });

  it('list() builds the $ilike search predicate over name/email and projects only the read-face columns (R-B1)', async () => {
    const { repo, spies } = makeRepo();
    await repo.list({ limit: 20, offset: 0, search: 'acme' });
    const [entity, where, options] = spies.findAndCount.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(User);
    expect(where).toEqual({
      $or: [{ name: { $ilike: '%acme%' } }, { email: { $ilike: '%acme%' } }],
    });
    expect(options).toMatchObject({
      fields: ['id', 'name', 'email', 'createdAt'],
      orderBy: { createdAt: QueryOrder.DESC },
      limit: 20,
      offset: 0,
    });
    expect(options.fields).not.toContain('password');
  });

  it('list() skips the status batch query for an empty page (no N+1) and reports total 0', async () => {
    const { repo, spies } = makeRepo({ users: [], total: 0 });
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(spies.findAndCount).toHaveBeenCalledTimes(1);
    expect(spies.find).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

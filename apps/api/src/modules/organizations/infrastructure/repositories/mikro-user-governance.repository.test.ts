import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroUserGovernanceRepository } from './mikro-user-governance.repository';

/**
 * global-governance-lifecycle-consolidation 切片 C 归列后读语义：跨平台用户视图（S6 · FR-6/FR-10）
 * 从旧「`findAndCount(User)` + `find(UserStatus, $in)` 批量拼接」**塌缩为单查 `user`**——态即行上
 * `user.status` NOT NULL 真列（旁表 JOIN 随本案消解·旧「无状态记录行视同 active」兑底已物化为列默认值）。
 * fake `em` 经 `MikroOrmService.fork()` 供给。刻意**无租户上下文**（平台级天然全量·FR-11①）。
 */
function makeRepo(opts: { users?: unknown[]; total?: number } = {}) {
  const findAndCount = vi.fn().mockResolvedValue([opts.users ?? [], opts.total ?? 0]);
  const find = vi.fn().mockResolvedValue([]);
  const findOne = vi.fn().mockResolvedValue(null);
  const em = { findAndCount, find, findOne } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroUserGovernanceRepository(mikro),
    spies: { fork, findAndCount, find, findOne },
  };
}

describe('MikroUserGovernanceRepository (S6 · FR-6/FR-10 跨平台用户视图·切片 C 归 user.status 真列)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() maps rows reading status straight off the user row, reports total', async () => {
    const users = [
      {
        id: 'u1',
        name: 'Ann',
        email: 'ann@x.com',
        status: ORGANIZATION_STATUS.ACTIVE,
        createdAt: new Date('2026-01-01'),
      },
    ];
    const { repo } = makeRepo({ users, total: 12 });
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(page.total).toBe(12);
    expect(page.items[0]).toMatchObject({
      userId: 'u1',
      name: 'Ann',
      email: 'ann@x.com',
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(page).toMatchObject({ limit: 20, offset: 0 });
  });

  it('list() surfaces an explicit suspended status carried on the user row', async () => {
    const users = [
      {
        id: 'u2',
        name: 'Bob',
        email: 'bob@x.com',
        status: ORGANIZATION_STATUS.SUSPENDED,
        createdAt: new Date('2026-02-01'),
      },
    ];
    const { repo } = makeRepo({ users, total: 1 });
    const page = await repo.list({ limit: 10, offset: 0, search: 'bob' });
    expect(page.items[0].status).toBe(ORGANIZATION_STATUS.SUSPENDED);
  });

  it('list() builds the $ilike search predicate over name/email and projects the read-face columns incl. status (R-B1)', async () => {
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
      fields: ['id', 'name', 'email', 'status', 'createdAt'],
      orderBy: { createdAt: QueryOrder.DESC },
      limit: 20,
      offset: 0,
    });
    expect(options.fields).not.toContain('password');
  });

  it('list() performs a single query per page (no旁表 batch lookup) and reports total 0 for an empty page', async () => {
    const { repo, spies } = makeRepo({ users: [], total: 0 });
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(spies.findAndCount).toHaveBeenCalledTimes(1);
    expect(spies.find).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

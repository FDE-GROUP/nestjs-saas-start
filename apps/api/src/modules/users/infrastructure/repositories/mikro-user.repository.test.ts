import { User as UserEntity } from '@app/database/ba/entities';
import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroUserRepository } from './mikro-user.repository';

/**
 * 架构精度修宪 S1：聚合死管道删除后的镜像断言——仓储收敛为「只读 + PIPL 硬删」，
 * fake `em` 经 `MikroOrmService.fork()` 供给（每操作独立 em·禁共享全局 em）。
 * `user` 属 users 上下文，写自身 owned 表 → 表所有权写侧纪律天然合规。
 */
function makeRepo() {
  const findOne = vi.fn().mockResolvedValue(null);
  // 写面 spy 保留但断言恒不被调用——锁「save 已随聚合退役不回潮」。
  const create = vi.fn((_entity: unknown, data: Record<string, unknown>) => data);
  const flush = vi.fn().mockResolvedValue(undefined);
  const persist = vi.fn(() => ({ flush }));
  const assign = vi.fn((entity: Record<string, unknown>, data: Record<string, unknown>) =>
    Object.assign(entity, data),
  );
  const nativeDelete = vi.fn().mockResolvedValue(1);
  const em = { findOne, create, persist, flush, assign, nativeDelete } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroUserRepository(mikro),
    spies: { fork, findOne, create, persist, flush, assign, nativeDelete },
  };
}

const entityRow = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'USER',
  password: 'hashed',
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('MikroUserRepository（架构精度修宪 S1 · 只读 + PIPL 硬删）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findById maps a record by id and returns null when no row matches', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...entityRow });
    const found = await repo.findById('u-1');
    expect(found).toEqual({
      id: 'u-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'USER',
      passwordHash: 'hashed',
      createdAt: entityRow.createdAt,
      updatedAt: entityRow.updatedAt,
    });
    expect(spies.findOne.mock.calls[0][0]).toBe(UserEntity);
    expect(spies.findOne.mock.calls[0][1]).toEqual({ id: 'u-1' });

    spies.findOne.mockResolvedValueOnce(null);
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('findByEmail queries by email predicate and maps the same record shape', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...entityRow });
    const user = await repo.findByEmail('ada@example.com');
    expect(user?.email).toBe('ada@example.com');
    expect(user?.passwordHash).toBe('hashed');
    expect(user?.role).toBe('USER');
    expect(spies.findOne.mock.calls[0][1]).toEqual({ email: 'ada@example.com' });
  });

  it('entityToRecord maps nullable columns: firstName/lastName ?? null, password ?? "", role 兜底 USER, updatedAt falls back to createdAt', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({
      id: 'u-2',
      name: 'Bob',
      email: 'bob@x.c',
      firstName: null,
      lastName: null,
      role: null,
      password: null,
      emailVerified: false,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: null,
    });
    const user = await repo.findById('u-2');
    expect(user?.firstName).toBeNull();
    expect(user?.lastName).toBeNull();
    expect(user?.passwordHash).toBe('');
    expect(user?.role).toBe('USER'); // role 兜底 'USER'
    expect(user?.updatedAt).toEqual(new Date('2026-03-01T00:00:00.000Z')); // updatedAt 兜底 createdAt
  });

  it('remove issues a single nativeDelete (pure SQL·FK cascade·R-B3 同律·never em.remove)', async () => {
    const { repo, spies } = makeRepo();
    await repo.remove('u-1');
    expect(spies.nativeDelete).toHaveBeenCalledTimes(1);
    const [entity, where] = spies.nativeDelete.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entity).toBe(UserEntity);
    expect(where).toEqual({ id: 'u-1' });
    expect(spies.fork).toHaveBeenCalledTimes(1);
  });

  it('写面收敛回归锁：create/persist/assign/flush 恒不被调用（save 已随聚合退役·不回潮）', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...entityRow });
    await repo.findById('u-1');
    await repo.remove('u-1');
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.persist).not.toHaveBeenCalled();
    expect(spies.assign).not.toHaveBeenCalled();
    expect(spies.flush).not.toHaveBeenCalled();
  });
});

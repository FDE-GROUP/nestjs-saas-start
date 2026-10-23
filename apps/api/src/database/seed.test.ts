import {
  Account,
  Session,
  User,
  Verification,
} from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import type { EntityManager } from '@mikro-orm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  createPosts,
  createUsers,
  enforceSeedPasswordPolicy,
  ensureLoginableUser,
  ensureTenantContext,
  runSeed,
} from './seed';

/**
 * seed 镜像断言（假 `em` + BA `signUpEmail` 桩·不触库/不触真 BA）。
 * - `createUsers` 自 module-db-seed-ba-loginable-accounts 切片 A 起走 `ensureLoginableUser`：按 email 三分支
 *   reconcile（无 user→signUp·有 user 有 credential→仅 nativeUpdate·有 user 无 credential→删孤儿再 signUp），
 *   **不再 `em.insert(User)`**（BA 亲自建 user+account+session·哈希与运行态 app BA 互验）。断言钉：
 *   ① signUp 调用次数与 body（email/password 明文·不再 bcrypt·name）；② nativeUpdate 补 `role`（运营者 ADMIN）
 *   且载荷不含 `password`；③ 删孤儿序列 `session→account→user`。
 * - `createPosts` 保真红线不变（insert 载荷不含 createdAt·必含 updatedAt·organizationId 归属）。
 * - `cleanup` 删序扩至 `session→account→verification→post→user`·`SEED_CLEANUP` 门控。
 * - `runSeed` 编排次序 cleanup→createUsers→createPosts（auth 注入）·入口守卫确保 import 不触发 `main()` 建连。
 */
function makeEm() {
  const findOne = vi.fn().mockResolvedValue(null);
  const insert = vi.fn().mockResolvedValue({});
  const nativeUpdate = vi.fn().mockResolvedValue(1);
  const nativeDelete = vi.fn().mockResolvedValue(1);
  const find = vi.fn().mockResolvedValue([]);
  const em = { findOne, insert, nativeUpdate, nativeDelete, find } as unknown as EntityManager;
  return { em, spies: { findOne, insert, nativeUpdate, nativeDelete, find } };
}

/** BA signUp 桩（不触真库/真 BA）·返回可断言的调用记录。结构上兼容 seed 的 LoginableAuth。 */
function makeAuth() {
  const signUpEmail = vi.fn().mockResolvedValue({ user: { id: 'ba-native-id' } });
  const createOrganization = vi.fn().mockResolvedValue({ id: 'org-ba' });
  return {
    auth: { api: { signUpEmail, createOrganization } },
    spies: { signUpEmail, createOrganization },
  };
}

/** 取针对某实体的 insert 调用（区分 User / Post）。 */
function insertsFor(insert: ReturnType<typeof vi.fn>, entity: unknown) {
  return insert.mock.calls.filter(([e]) => e === entity).map(([, d]) => d);
}

const ENV_KEYS = [
  'PLATFORM_OPERATOR_EMAIL',
  'ADMIN_PASSWORD',
  'USER_PASSWORD',
  'SEED_CLEANUP',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  vi.stubEnv('PLATFORM_OPERATOR_EMAIL', 'op@example.com');
  vi.stubEnv('ADMIN_PASSWORD', 'secret-admin');
  vi.stubEnv('USER_PASSWORD', 'secret-user');
  vi.stubEnv('SEED_CLEANUP', '');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('seed createUsers (BA signUp·可登录)', () => {
  it('operator 不存在（findOne User→null）→ signUpEmail 一次 + nativeUpdate role=ADMIN·绥不 em.insert(User)', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne.mockResolvedValueOnce(null);

    await createUsers(em, { includeTestData: false, userCount: 1, postCount: 0 }, auth);

    expect(as.signUpEmail).toHaveBeenCalledTimes(1);
    expect(as.signUpEmail.mock.calls[0][0]).toEqual({
      body: { email: 'op@example.com', password: 'secret-admin', name: 'Admin User' },
    });
    expect(spies.insert).not.toHaveBeenCalled(); // 不再直插 user
    const [entity, where, set] = spies.nativeUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(User);
    expect(where).toEqual({ email: 'op@example.com' });
    expect(set.role).toBe('ADMIN');
    expect(set.updatedAt).toBeInstanceOf(Date);
    expect(set).not.toHaveProperty('password'); // BA credential 落 account·user.password 不再手写
  });

  it('operator 已存在且有 credential account → 不 signUp·仅 nativeUpdate（幂等）', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne
      .mockResolvedValueOnce({ id: 'u1', email: 'op@example.com' }) // user 存在
      .mockResolvedValueOnce({ id: 'a1', providerId: 'credential' }); // account 存在

    await createUsers(em, { includeTestData: false, userCount: 1, postCount: 0 }, auth);

    expect(as.signUpEmail).not.toHaveBeenCalled();
    expect(spies.nativeDelete).not.toHaveBeenCalled();
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
    expect(spies.nativeUpdate.mock.calls[0][1]).toEqual({ email: 'op@example.com' });
  });

  it('operator 已存在但无 credential（legacy 直插残留）→ 先删该身份 session/account/user 孤儿，再 signUp + update', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne
      .mockResolvedValueOnce({ id: 'u1', email: 'op@example.com' }) // user 存在
      .mockResolvedValueOnce(null); // account 不存在

    await createUsers(em, { includeTestData: false, userCount: 1, postCount: 0 }, auth);

    expect(spies.nativeDelete).toHaveBeenCalledTimes(3);
    expect(spies.nativeDelete.mock.calls.map((c) => c[0])).toEqual([Session, Account, User]);
    expect(as.signUpEmail).toHaveBeenCalledTimes(1);
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
  });

  it('includeTestData & userCount=3 → operator/user1/user2 各 ensureLoginableUser（均无→各 signUp·各 update）', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne.mockResolvedValue(null); // 全部不存在 → 全走 signUp

    await createUsers(em, { includeTestData: true, userCount: 3, postCount: 0 }, auth);

    expect(as.signUpEmail).toHaveBeenCalledTimes(3);
    const emails = as.signUpEmail.mock.calls.map(
      (c) => (c[0] as { body: { email: string } }).body.email,
    );
    expect(emails).toEqual(['op@example.com', 'user1@example.com', 'user2@example.com']);
    expect(spies.insert).not.toHaveBeenCalled();
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(3); // 每次 signUp 后一次补字段
  });

  it('ensureLoginableUser 直调：无 user → signUpEmail 恰一次·返 signed-up', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne.mockResolvedValueOnce(null);

    const result = await ensureLoginableUser(em, auth, {
      email: 'x@example.com',
      password: 'p',
      name: 'X',
      firstName: 'X',
      lastName: '',
      role: 'USER',
    });

    expect(result).toBe('signed-up');
    expect(as.signUpEmail).toHaveBeenCalledTimes(1);
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
  });

  it('ensureLoginableUser 直调：有 user 有 credential → 返 updated·不 signUp·不删', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne.mockResolvedValueOnce({ id: 'u1', email: 'op@example.com' });
    spies.findOne.mockResolvedValueOnce({ id: 'a1', providerId: 'credential' });

    const result = await ensureLoginableUser(em, auth, {
      email: 'op@example.com',
      password: 'p',
      name: 'X',
      firstName: 'X',
      lastName: '',
      role: 'ADMIN',
    });

    expect(result).toBe('updated');
    expect(as.signUpEmail).not.toHaveBeenCalled();
    expect(spies.nativeDelete).not.toHaveBeenCalled();
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
  });

  it('ensureLoginableUser 直调：有 user 无 credential → 删孤儿 session→account→user 后 signUp·返 signed-up', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne.mockResolvedValueOnce({ id: 'u1', email: 'x@example.com' });
    spies.findOne.mockResolvedValueOnce(null);

    const result = await ensureLoginableUser(em, auth, {
      email: 'x@example.com',
      password: 'p',
      name: 'X',
      firstName: 'X',
      lastName: '',
      role: 'USER',
    });

    expect(result).toBe('signed-up');
    expect(spies.nativeDelete.mock.calls.map((c) => c[0])).toEqual([Session, Account, User]);
    expect(as.signUpEmail).toHaveBeenCalledTimes(1);
  });

  it('演示密码明文透传：userCount=2 → user1 的 signUp body.password === env USER_PASSWORD（不 bcrypt）', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne
      .mockResolvedValueOnce({ id: 'u1', email: 'op@example.com' }) // operator 有
      .mockResolvedValueOnce({ id: 'a1', providerId: 'credential' }) // 有 account → 不 signUp
      .mockResolvedValueOnce(null); // user1 不存在 → signUp

    await createUsers(em, { includeTestData: true, userCount: 2, postCount: 0 }, auth);

    expect(as.signUpEmail).toHaveBeenCalledTimes(1); // 仅 user1
    expect(as.signUpEmail.mock.calls[0][0]).toEqual({
      body: { email: 'user1@example.com', password: 'secret-user', name: 'User 1' },
    });
  });
});

describe('seed createPosts (S-d6)', () => {
  it('无 organization → 跳过·不 insert post', async () => {
    const { em, spies } = makeEm();
    spies.find.mockResolvedValueOnce([]);

    await createPosts(em, { includeTestData: true, userCount: 0, postCount: 3 });

    expect(spies.find).toHaveBeenCalledTimes(1);
    expect(spies.find.mock.calls[0][0]).toBe(Organization);
    expect(spies.find.mock.calls[0][1]).toEqual({});
    expect(spies.find.mock.calls[0][2]).toEqual({ limit: 1 });
    expect(insertsFor(spies.insert, PostEntity)).toHaveLength(0);
  });

  it('有 organization → 每 post 盖 organizationId·显式 updatedAt·不写 createdAt（落 DB 默认）', async () => {
    const { em, spies } = makeEm();
    spies.find.mockResolvedValueOnce([{ id: 'org-1' }]);

    await createPosts(em, { includeTestData: true, userCount: 0, postCount: 2 });

    const postInserts = insertsFor(spies.insert, PostEntity);
    expect(postInserts).toHaveLength(1);
    const batch = postInserts[0] as (Record<string, unknown> & { organizationId: string })[];
    expect(batch).toHaveLength(2);
    expect(batch.every((p) => p.organizationId === 'org-1')).toBe(true);
    expect(batch.every((p) => !('createdAt' in p))).toBe(true);
    expect(batch.every((p) => p.updatedAt instanceof Date)).toBe(true);
  });

  it('includeTestData=false → 早退·不查 organization', async () => {
    const { em, spies } = makeEm();
    await createPosts(em, { includeTestData: false, userCount: 0, postCount: 3 });
    expect(spies.find).not.toHaveBeenCalled();
    expect(spies.insert).not.toHaveBeenCalled();
  });
});

describe('seed cleanup（BA 表随 user 清·切片 A）', () => {
  it('SEED_CLEANUP=true → 删序 session→account→verification→post→user', async () => {
    vi.stubEnv('SEED_CLEANUP', 'true');
    const { em, spies } = makeEm();

    await cleanup(em);

    expect(spies.nativeDelete).toHaveBeenCalledTimes(5);
    expect(spies.nativeDelete.mock.calls.map((c) => c[0])).toEqual([
      Session,
      Account,
      Verification,
      PostEntity,
      User,
    ]);
    for (const call of spies.nativeDelete.mock.calls) expect(call[1]).toEqual({});
  });

  it('SEED_CLEANUP≠true → 不删', async () => {
    vi.stubEnv('SEED_CLEANUP', 'false');
    const { em, spies } = makeEm();
    await cleanup(em);
    expect(spies.nativeDelete).not.toHaveBeenCalled();
  });
});

describe('seed runSeed 编排', () => {
  it('按 cleanup → createUsers → ensureSeedOrganizations → createPosts 次序（含 auth 注入）', async () => {
    vi.stubEnv('SEED_CLEANUP', 'true');
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.findOne.mockImplementation((entity: unknown) => {
      if (entity === Account) return Promise.resolve({ id: 'a', providerId: 'credential' });
      if (entity === User) return Promise.resolve({ id: 'u-op', email: 'op@example.com' });
      return Promise.resolve(null);
    });
    spies.find.mockImplementation((entity: unknown, where?: Record<string, unknown>) => {
      // ensureTenantContext 按 slug 查 → 空（走 createOrganization）；createPosts 无 where → 命中 org-1。
      if (entity === Organization && where?.slug) return Promise.resolve([]);
      if (entity === Organization) return Promise.resolve([{ id: 'org-1' }]);
      return Promise.resolve([]);
    });

    await runSeed(em, { includeTestData: true, userCount: 1, postCount: 1 }, auth);

    // cleanup 的五条 nativeDelete 必先于任何 insert（编排次序钉死）。
    expect(spies.nativeDelete).toHaveBeenCalledTimes(5);
    const order = [
      ...spies.nativeDelete.mock.calls.map(() => 'delete'),
      ...spies.insert.mock.calls.map(() => 'insert'),
    ];
    expect(order[0]).toBe('delete');
    // operator 有 account → 仅 nativeUpdate（不 signUp）；ensureSeedOrganizations 建租（createOrganization）；createPosts 插 Post。
    expect(as.signUpEmail).not.toHaveBeenCalled();
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
    expect(as.createOrganization).toHaveBeenCalledTimes(1);
    expect(as.createOrganization.mock.calls[0][0]).toEqual({
      body: { name: 'Acme (Seed)', slug: 'seed-acme', userId: 'u-op' },
    });
    expect(insertsFor(spies.insert, PostEntity)).toHaveLength(1);
  });
});

describe('seed ensureTenantContext（预建活跃 org+owner）', () => {
  it('无同 slug org → createOrganization 系统动作（body.userId=owner）·返 created·不直插', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.find.mockResolvedValueOnce([]); // 无 org

    const result = await ensureTenantContext(em, auth, {
      slug: 'seed-acme',
      name: 'Acme (Seed)',
      ownerUserId: 'u1',
    });

    expect(result).toBe('created');
    expect(as.createOrganization).toHaveBeenCalledTimes(1);
    expect(as.createOrganization.mock.calls[0][0]).toEqual({
      body: { name: 'Acme (Seed)', slug: 'seed-acme', userId: 'u1' },
    });
    expect(insertsFor(spies.insert, Member)).toHaveLength(0); // BA 自带 owner member
  });

  it('有同 slug org 但无 owner member → 直插 owner member·返 exists·不 createOrganization', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.find.mockResolvedValueOnce([{ id: 'org-1' }]); // 有 org
    spies.findOne.mockResolvedValueOnce(null); // 无 member

    const result = await ensureTenantContext(em, auth, {
      slug: 'seed-acme',
      name: 'Acme (Seed)',
      ownerUserId: 'u1',
    });

    expect(result).toBe('exists');
    expect(as.createOrganization).not.toHaveBeenCalled();
    const memberInserts = insertsFor(spies.insert, Member);
    expect(memberInserts).toHaveLength(1);
    expect(memberInserts[0]).toMatchObject({
      organizationId: 'org-1',
      userId: 'u1',
      role: 'owner',
    });
    expect((memberInserts[0] as { createdAt: unknown }).createdAt).toBeInstanceOf(Date);
  });

  it('有同 slug org 且 owner member 已存在 → 不重插·返 exists（幂等）', async () => {
    const { em, spies } = makeEm();
    const { auth, spies: as } = makeAuth();
    spies.find.mockResolvedValueOnce([{ id: 'org-1' }]);
    spies.findOne.mockResolvedValueOnce({ id: 'm1', role: 'owner' }); // member 存在

    const result = await ensureTenantContext(em, auth, {
      slug: 'seed-acme',
      name: 'Acme (Seed)',
      ownerUserId: 'u1',
    });

    expect(result).toBe('exists');
    expect(insertsFor(spies.insert, Member)).toHaveLength(0);
    expect(as.createOrganization).not.toHaveBeenCalled();
  });
});

describe('seed 口令裁决单点（seed-fail-loud 切片 E·人裁①）', () => {
  it('生产缺键 → throw 拒跑且文案点名缺失键与后果（env 注入·不触全局不触库）', () => {
    expect(() => enforceSeedPasswordPolicy({ NODE_ENV: 'production' })).toThrowError(
      /Refusing to seed[\s\S]*ADMIN_PASSWORD[\s\S]*USER_PASSWORD/,
    );
    // 只缺一键也拒·且仅点名缺的那键（不吞未缺键）。
    expect(() =>
      enforceSeedPasswordPolicy({ NODE_ENV: 'production', ADMIN_PASSWORD: 'strong-pass' }),
    ).toThrowError(/USER_PASSWORD/);
  });

  it('生产两键配齐（合成假值）→ 静默放行：不 throw 且零 warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      enforceSeedPasswordPolicy({
        NODE_ENV: 'production',
        ADMIN_PASSWORD: 'synthetic-a',
        USER_PASSWORD: 'synthetic-b',
      }),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('非生产缺键 → 不拦 + 恰一条点名 warn（两键名与兜底值同形·承现路径）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => enforceSeedPasswordPolicy({ NODE_ENV: 'development' })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('ADMIN_PASSWORD / USER_PASSWORD');
    expect(line).toContain('admin123/user123');
    warn.mockRestore();
  });
});

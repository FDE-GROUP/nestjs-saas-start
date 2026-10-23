import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { describe, expect, it, vi } from 'vitest';
import { AuthSessionReader, pathSegmentMatch } from './auth-session.reader';

describe('pathSegmentMatch（段对齐·防子串误撞）', () => {
  it('/auth 命中 auth 面但不误撞 /authors 或 query', () => {
    expect(pathSegmentMatch('/api/v1/auth/login', '/auth')).toBe(true);
    expect(pathSegmentMatch('/api/v1/auth/callback/github', '/auth')).toBe(true);
    expect(pathSegmentMatch('/api/v1/authors', '/auth')).toBe(false);
    expect(pathSegmentMatch('/api/v1/posts?next=/auth/x', '/auth')).toBe(false);
    expect(pathSegmentMatch('/api/v1/health', '/health')).toBe(true);
    expect(pathSegmentMatch('/api/v1/healthz', '/health')).toBe(false);
  });
});

/** `RequestSessionReader` 适配：封装 cookie/旁路短路 + Better Auth 会话解析（+ 丙裁角色预注入）。 */
describe('AuthSessionReader (P1b · 会话端口适配)', () => {
  function readerWith(session: unknown, opts: { noAuth?: boolean; memberRole?: unknown } = {}) {
    const getSession = vi.fn().mockResolvedValue(session);
    // BA 服务端真名对拍 organization.mjs 路由表：getActiveMemberRole → { role }（非 client 面
    // getOrganizationList，且 listOrganizations 纯 org 字段不带 role）。
    const getActiveMemberRole = vi
      .fn()
      .mockResolvedValue(opts.memberRole === undefined ? null : { role: opts.memberRole });
    const authInstance = {
      get: () =>
        opts.noAuth ? undefined : ({ api: { getSession, getActiveMemberRole } } as never),
      set: () => {},
    } as unknown as InjectAuthInstance;
    return { reader: new AuthSessionReader(authInstance), getSession, getActiveMemberRole };
  }

  it('returns null WITHOUT a session lookup for a request with no cookie', async () => {
    const { reader, getSession } = readerWith({ user: { id: 'u1' } });
    await expect(reader.read({ headers: {}, url: '/posts' })).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('short-circuits bypass / health routes (no getSession)', async () => {
    const { reader, getSession } = readerWith({ user: { id: 'u1' } });
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/api/v1/health' }),
    ).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('auth 面（/api/v1/auth/*）旁路：不触发会话查询', async () => {
    const { reader, getSession } = readerWith({ user: { id: 'u1' } });
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/api/v1/auth/sign-in' }),
    ).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('地雷回归：/api/v1/authors 含 /auth 子串但**不**旁路（段对齐后走会话解析）', async () => {
    const { reader, getSession } = readerWith({ user: { id: 'u1' } });
    await reader.read({ headers: { cookie: 'session=abc' }, url: '/api/v1/authors' });
    expect(getSession).toHaveBeenCalled();
  });

  it('地雷回归：query 携 /auth 不旁路（已剥 query）', async () => {
    const { reader, getSession } = readerWith({ user: { id: 'u1' } });
    await reader.read({ headers: { cookie: 'session=abc' }, url: '/api/v1/posts?next=/auth/x' });
    expect(getSession).toHaveBeenCalled();
  });

  it('returns null when the auth instance is not initialized', async () => {
    const { reader } = readerWith({ user: { id: 'u1' } }, { noAuth: true });
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toBeNull();
  });

  it('maps a resolved session to the scalar view（无活动租户 → 不付角色读）', async () => {
    const { reader, getActiveMemberRole } = readerWith({ user: { id: 'u1' } });
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toEqual({ userId: 'u1' });
    expect(getActiveMemberRole).not.toHaveBeenCalled();
  });

  it('有活动租户时从 BA 数据面预注入成员角色（module-rbac-casl 丙裁）', async () => {
    const { reader } = readerWith(
      { user: { id: 'u1' }, session: { activeOrganizationId: 'org_1' } },
      { memberRole: 'admin' },
    );
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toEqual({ userId: 'u1', activeOrganizationId: 'org_1', role: 'admin' });
  });

  it('角色透传归一（丙裁：DB 运行时词汇·自定义 key 合法）；非法值/读取失败 → role 缺省 fail-closed', async () => {
    // 'wizard' 不再是「词汇外拒入」——自定义角色 key 合法透传，存在性/授权由投影侧查 DB 裁决。
    const { reader } = readerWith(
      { user: { id: 'u1' }, session: { activeOrganizationId: 'org_1' } },
      { memberRole: 'wizard' },
    );
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toEqual({ userId: 'u1', activeOrganizationId: 'org_1', role: 'wizard' });

    // 非法值（空串）仍归一 undefined（消费侧 fail-closed）。
    const empty = readerWith(
      { user: { id: 'u1' }, session: { activeOrganizationId: 'org_1' } },
      { memberRole: '' },
    );
    await expect(
      empty.reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toEqual({ userId: 'u1', activeOrganizationId: 'org_1', role: undefined });

    const failing = readerWith(
      { user: { id: 'u1' }, session: { activeOrganizationId: 'org_1' } },
      { memberRole: 'member' },
    );
    failing.getActiveMemberRole.mockRejectedValue(new Error('not a member'));
    await expect(
      failing.reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toEqual({ userId: 'u1', activeOrganizationId: 'org_1', role: undefined });
  });

  it('normalizes an unresolved session (null) to no tenant context', async () => {
    const { reader } = readerWith(null);
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toBeNull();
  });
});

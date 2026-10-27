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

  // X7 切片 C 换源：reader 不再从 BA 数据面（getActiveMemberRole org 维）预注入成员角色——
  // 会话角色改由中间件在活动租户解析后经 `TENANT_SCOPE_RESOLVER.resolveTenantRole` 供（见
  // tenant-isolation.middleware.test 的租级角色绑定测）；故本文件不再测 reader 携 role。

  it('normalizes an unresolved session (null) to no tenant context', async () => {
    const { reader } = readerWith(null);
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toBeNull();
  });
});

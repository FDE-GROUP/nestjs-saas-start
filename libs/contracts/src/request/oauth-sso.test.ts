import { describe, expect, it } from 'vitest';
import { userinfoResponseSchema } from '../response/oauth-sso';
import { authorizeQuerySchema } from './oauth-sso';

describe('@saas/contracts · oauth-sso authorize 契约（隐式流·切片 A）', () => {
  const base = { client_id: 'odoo-1', redirect_uri: 'https://odoo/x', response_type: 'token' };

  it('接受最小隐式流入参', () => {
    expect(authorizeQuerySchema.parse(base).response_type).toBe('token');
  });

  it('接受 state 与合法 scope 子集', () => {
    const r = authorizeQuerySchema.parse({ ...base, scope: 'openid profile email', state: 'xyz' });
    expect(r.scope).toBe('openid profile email');
    expect(r.state).toBe('xyz');
  });

  it('strict 拒未知键（复刻 forbidNonWhitelisted）', () => {
    expect(() => authorizeQuerySchema.parse({ ...base, extra: 1 })).toThrow();
  });

  it('拒缺失 client_id / redirect_uri', () => {
    expect(() =>
      authorizeQuerySchema.parse({ redirect_uri: 'https://odoo/x', response_type: 'token' }),
    ).toThrow();
  });

  it('拒非 token 的 response_type（CE 仅隐式流·fail-closed）', () => {
    expect(() => authorizeQuerySchema.parse({ ...base, response_type: 'code' })).toThrow();
  });

  it('拒越界 scope（含未授权词）', () => {
    expect(() => authorizeQuerySchema.parse({ ...base, scope: 'openid offline_access' })).toThrow();
  });
});

describe('@saas/contracts · oauth-sso userinfo 契约（白名单出线·切片 A）', () => {
  it('白名单 strip 未声明字段（PII fail-closed）', () => {
    const r = userinfoResponseSchema.parse({ sub: 'u1', email: 'a@b.c', name: 'N', phone: 'leak' });
    expect(r).toEqual({ sub: 'u1', email: 'a@b.c', name: 'N' });
  });

  it('缺 sub/email/name 任一即拒', () => {
    expect(() => userinfoResponseSchema.parse({ sub: 'u1', email: 'a@b.c' })).toThrow();
  });
});

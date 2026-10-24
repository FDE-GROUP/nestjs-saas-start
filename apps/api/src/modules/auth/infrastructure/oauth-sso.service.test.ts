import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { OauthAuthorizeQuery } from '@saas/contracts/index';
import { describe, expect, it } from 'vitest';
import { OauthSsoService } from './oauth-sso.service';
import { SsoTokenService } from './sso-token.service';

const REDIRECT = 'https://odoo.example.com/odoo/oauth2/callback';

/** user 行形状桩（仅 userinfo 读侧关心的列）。 @internal */
interface UserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

/**
 * 构造带单注册 client（audience=odoo-1）的 SSO 服务 + 同密钥 token 原语。
 * @param clients - 覆盖缺省注册表。
 * @param user - `em.findOne(User,{id})` 返回行（userinfo 用）。
 * @internal
 */
function make(
  clients: unknown[] = [{ clientId: 'odoo-1', redirectUris: [REDIRECT], audience: 'odoo-1' }],
  user: UserRow | null = { id: 'user-1', name: 'Ada', email: 'a@b.c', emailVerified: true },
) {
  const config = {
    getAuthConfig: () => ({ jwt: { secret: 'test-secret' } }),
    getAppConfig: () => ({ name: 'test-op' }),
    getOauthSsoConfig: () => ({ clients }),
  };
  const ssoToken = new SsoTokenService(config as never);
  const mikro = { fork: async () => ({ findOne: async () => user }) };
  return { svc: new OauthSsoService(config as never, ssoToken, mikro as never), ssoToken };
}

/** 组装已过 zod 契约的 authorize 入参。 @internal */
function q(over: Partial<OauthAuthorizeQuery> = {}): OauthAuthorizeQuery {
  return { client_id: 'odoo-1', redirect_uri: REDIRECT, response_type: 'token', ...over };
}

describe('auth · SSO authorize 业务逻辑（oauth-sso-odoo-integration 切片 C）', () => {
  it('已注册 client + 精确 redirect → 302 目标带 access_token fragment', () => {
    const { svc } = make();
    const location = svc.buildAuthorizeRedirect(q(), { id: 'user-1', email: 'a@b.c' });
    expect(location.startsWith(`${REDIRECT}#`)).toBe(true);
    const frag = new URLSearchParams(location.slice(REDIRECT.length + 1));
    expect(frag.get('token_type')).toBe('Bearer');
    expect((frag.get('access_token') ?? '').split('.')).toHaveLength(3);
    expect(frag.get('expires_in')).toBeTruthy();
  });

  it('state 透传回 fragment', () => {
    const { svc } = make();
    const location = svc.buildAuthorizeRedirect(q({ state: 'nonce-42' }), { id: 'u', email: 'e' });
    expect(new URLSearchParams(location.slice(REDIRECT.length + 1)).get('state')).toBe('nonce-42');
  });

  it('redirect_uri 已含 `#` → 以 `&` 续接 fragment', () => {
    const withHash = `${REDIRECT}#existing`;
    const { svc } = make([{ clientId: 'odoo-1', redirectUris: [withHash], audience: 'odoo-1' }]);
    const location = svc.buildAuthorizeRedirect(q({ redirect_uri: withHash }), {
      id: 'u',
      email: 'e',
    });
    expect(location).toContain(`${withHash}&access_token=`);
  });

  it('未注册 client_id → 400（不重定向到未登记地址）', () => {
    const { svc } = make();
    expect(() =>
      svc.buildAuthorizeRedirect(q({ client_id: 'evil' }), { id: 'u', email: 'e' }),
    ).toThrow(BadRequestException);
  });

  it('redirect_uri 非精确匹配（前缀攻击）→ 400', () => {
    const { svc } = make();
    expect(() =>
      svc.buildAuthorizeRedirect(q({ redirect_uri: `${REDIRECT}/evil` }), { id: 'u', email: 'e' }),
    ).toThrow(BadRequestException);
  });
});

describe('auth · SSO userinfo 业务逻辑（oauth-sso-odoo-integration 切片 D）', () => {
  it('有效 Bearer + aud 已注册 + 邮箱已验证 → 权威 {sub,email,name}', async () => {
    const { svc, ssoToken } = make();
    const { accessToken } = ssoToken.issue('user-1', 'odoo-1');
    await expect(svc.resolveUserInfo(`Bearer ${accessToken}`)).resolves.toEqual({
      sub: 'user-1',
      email: 'a@b.c',
      name: 'Ada',
    });
  });

  it('缺 Authorization 头 → 401', async () => {
    const { svc } = make();
    await expect(svc.resolveUserInfo(undefined)).rejects.toThrow(UnauthorizedException);
  });

  it('非法令牌（结构乱串）→ 401', async () => {
    const { svc } = make();
    await expect(svc.resolveUserInfo('Bearer not.a.jwt')).rejects.toThrow(UnauthorizedException);
  });

  it('aud 不在注册受众集（confused-deputy）→ 401', async () => {
    const { svc, ssoToken } = make();
    const { accessToken } = ssoToken.issue('user-1', 'other-aud');
    await expect(svc.resolveUserInfo(`Bearer ${accessToken}`)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('主体查无 → 401', async () => {
    const { svc, ssoToken } = make(undefined, null);
    const { accessToken } = ssoToken.issue('ghost', 'odoo-1');
    await expect(svc.resolveUserInfo(`Bearer ${accessToken}`)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('邮箱未验证 → 403（硬门）', async () => {
    const { svc, ssoToken } = make(undefined, {
      id: 'user-1',
      name: 'Ada',
      email: 'a@b.c',
      emailVerified: false,
    });
    const { accessToken } = ssoToken.issue('user-1', 'odoo-1');
    await expect(svc.resolveUserInfo(`Bearer ${accessToken}`)).rejects.toThrow(ForbiddenException);
  });
});

import type { OrganizationOdooBindingRow } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
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

/** authorize 门禁默认放行的 ready 绑定行（活跃租户 + Odoo 公司就绪·切片 D 门禁放行态）。 @internal */
function readyBinding(organizationId = 'org-1'): OrganizationOdooBindingRow {
  return {
    organizationId,
    odooCompanyId: 42,
    odooBindingStatus: 'ready',
    odooCompanyName: `SAAS-${organizationId}`,
    odooBoundAt: new Date(),
  };
}

/**
 * authorize fail-closed 门禁的桩入参（缺省=放行：活跃租户 ready 绑定）。
 * @internal
 */
interface GateStub {
  /** 会话活跃租户 id（`null` = 无活跃租户·跨租 OP 软读缺席）。 */
  organizationId?: string | null;
  /** `bindings.read` 返回行（`null` = 查无绑定）。 */
  binding?: OrganizationOdooBindingRow | null;
}

/**
 * 构造带单注册 client（audience=odoo-1）的 SSO 服务 + 同密钥 token 原语。
 * @param clients - 覆盖缺省注册表。
 * @param user - `em.findOne(User,{id})` 返回行（userinfo 用）。
 * @param gate - authorize 门禁桩（活跃租户 + 绑定行·缺省 ready 放行）。
 * @internal
 */
function make(
  clients: unknown[] = [{ clientId: 'odoo-1', redirectUris: [REDIRECT], audience: 'odoo-1' }],
  user: UserRow | null = { id: 'user-1', name: 'Ada', email: 'a@b.c', emailVerified: true },
  gate: GateStub = {},
) {
  const config = {
    getAuthConfig: () => ({ jwt: { secret: 'test-secret' } }),
    getAppConfig: () => ({ name: 'test-op' }),
    getOauthSsoConfig: () => ({ clients }),
  };
  const ssoToken = new SsoTokenService(config as never);
  const mikro = { fork: async () => ({ findOne: async () => user }) };
  const organizationId = 'organizationId' in gate ? gate.organizationId : 'org-1';
  const binding = 'binding' in gate ? gate.binding : readyBinding();
  const bindings = { read: async () => binding ?? null };
  const tenant = { organizationId: organizationId ?? undefined };
  return {
    svc: new OauthSsoService(
      config as never,
      ssoToken,
      mikro as never,
      bindings as never,
      tenant as never,
    ),
    ssoToken,
  };
}

/** 组装已过 zod 契约的 authorize 入参。 @internal */
function q(over: Partial<OauthAuthorizeQuery> = {}): OauthAuthorizeQuery {
  return { client_id: 'odoo-1', redirect_uri: REDIRECT, response_type: 'token', ...over };
}

describe('auth · SSO authorize 业务逻辑（oauth-sso-odoo-integration 切片 C · 门禁切片 D）', () => {
  it('ready 绑定 + 已注册 client + 精确 redirect → 302 目标带 access_token fragment', async () => {
    const { svc } = make();
    const location = await svc.buildAuthorizeRedirect(q(), { id: 'user-1', email: 'a@b.c' });
    expect(location.startsWith(`${REDIRECT}#`)).toBe(true);
    const frag = new URLSearchParams(location.slice(REDIRECT.length + 1));
    expect(frag.get('token_type')).toBe('Bearer');
    expect((frag.get('access_token') ?? '').split('.')).toHaveLength(3);
    expect(frag.get('expires_in')).toBeTruthy();
  });

  it('state 透传回 fragment', async () => {
    const { svc } = make();
    const location = await svc.buildAuthorizeRedirect(q({ state: 'nonce-42' }), {
      id: 'u',
      email: 'e',
    });
    expect(new URLSearchParams(location.slice(REDIRECT.length + 1)).get('state')).toBe('nonce-42');
  });

  it('redirect_uri 已含 `#` → 以 `&` 续接 fragment', async () => {
    const withHash = `${REDIRECT}#existing`;
    const { svc } = make([{ clientId: 'odoo-1', redirectUris: [withHash], audience: 'odoo-1' }]);
    const location = await svc.buildAuthorizeRedirect(q({ redirect_uri: withHash }), {
      id: 'u',
      email: 'e',
    });
    expect(location).toContain(`${withHash}&access_token=`);
  });

  it('未注册 client_id → 400（不重定向到未登记地址·门禁前置校验先拒）', async () => {
    const { svc } = make();
    await expect(
      svc.buildAuthorizeRedirect(q({ client_id: 'evil' }), { id: 'u', email: 'e' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('redirect_uri 非精确匹配（前缀攻击）→ 400', async () => {
    const { svc } = make();
    await expect(
      svc.buildAuthorizeRedirect(q({ redirect_uri: `${REDIRECT}/evil` }), { id: 'u', email: 'e' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('活跃租户查无绑定（未开通）→ 403（fail-closed·铸令牌前阻断）', async () => {
    const { svc } = make(undefined, undefined, { binding: null });
    await expect(svc.buildAuthorizeRedirect(q(), { id: 'u', email: 'e' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('绑定 provisioning（建司中）→ 403（审批过≠Odoo 可入）', async () => {
    const { svc } = make(undefined, undefined, {
      binding: {
        organizationId: 'org-1',
        odooCompanyId: null,
        odooBindingStatus: 'provisioning',
        odooCompanyName: null,
        odooBoundAt: null,
      },
    });
    await expect(svc.buildAuthorizeRedirect(q(), { id: 'u', email: 'e' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('无活跃租户 → 403（跨租 OP 软读缺席=不可入）', async () => {
    const { svc } = make(undefined, undefined, { organizationId: null });
    await expect(svc.buildAuthorizeRedirect(q(), { id: 'u', email: 'e' })).rejects.toThrow(
      ForbiddenException,
    );
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

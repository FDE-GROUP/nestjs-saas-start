import { describe, expect, it, vi } from 'vitest';
import { SSO_ACCESS_TOKEN_TTL_SECONDS, SsoTokenService } from './sso-token.service';

/** 构造仅含 SSO token 所需取数器的 config 桩。 @internal */
function makeService(secret = 'test-secret') {
  const config = {
    getAuthConfig: () => ({ jwt: { secret } }),
    getAppConfig: () => ({ name: 'test-op' }),
  };
  return new SsoTokenService(config as never);
}

describe('auth · SSO 令牌原语（oauth-sso-odoo-integration 切片 C）', () => {
  it('签发→验签往返：解出 sub/aud/iss 与 TTL 一致', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const svc = makeService();
    const issued = svc.issue('user-1', 'odoo-aud');
    expect(issued.tokenType).toBe('Bearer');
    expect(issued.expiresIn).toBe(SSO_ACCESS_TOKEN_TTL_SECONDS);
    expect(issued.accessToken.split('.')).toHaveLength(3);
    const claims = svc.verify(issued.accessToken);
    expect(claims?.sub).toBe('user-1');
    expect(claims?.aud).toBe('odoo-aud');
    expect(claims?.iss).toBe('test-op');
    vi.useRealTimers();
  });

  it('篡改 payload → 验签失败返回 null（fail-closed）', () => {
    const svc = makeService();
    const { accessToken } = svc.issue('user-1', 'odoo-aud');
    const [h, , s] = accessToken.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'admin', aud: 'x', exp: 9e9 })).toString('base64url')}.${s}`;
    expect(svc.verify(forged)).toBeNull();
  });

  it('换密钥签发 → 验签失败（签名不符）', () => {
    const minted = makeService('secret-A').issue('user-1', 'odoo-aud').accessToken;
    expect(makeService('secret-B').verify(minted)).toBeNull();
  });

  it('过期 → 验签返回 null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const svc = makeService();
    const { accessToken } = svc.issue('user-1', 'odoo-aud');
    vi.advanceTimersByTime((SSO_ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    expect(svc.verify(accessToken)).toBeNull();
    vi.useRealTimers();
  });

  it('结构非法（非三段 / 乱串）→ null 不抛', () => {
    const svc = makeService();
    expect(svc.verify('a.b')).toBeNull();
    expect(svc.verify('not.a.jwt')).toBeNull();
    expect(svc.verify('')).toBeNull();
  });
});

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@app/config/config.service';
import { Inject, Injectable } from '@nestjs/common';

/**
 * SSO 访问令牌载荷（验签通过后返回的最小claims）。
 *
 * @public
 */
export interface SsoAccessTokenClaims {
  /** 主体（用户 id）。 */
  sub: string;
  /** 受众（铸发时绑定的 client audience）。 */
  aud: string;
  /** 签发者。 */
  iss: string;
  /** 签发时刻（秒）。 */
  iat: number;
  /** 过期时刻（秒）。 */
  exp: number;
  /** 唯一标识（防重放/审计）。 */
  jti: string;
}

/**
 * 铸发返回（对齐 OAuth2 隐式流 fragment 字段）。
 *
 * @public
 */
export interface SsoIssuedToken {
  /** 紧凑 JWS 访问令牌。 */
  accessToken: string;
  /** 令牌类型（隐式流恒 `Bearer`）。 */
  tokenType: 'Bearer';
  /** 有效期（秒）。 */
  expiresIn: number;
}

/** 超短 TTL（秒）：隐式流令牌只用于紧随的 userinfo 拉取，越长暴露面越大（调研 §5 风险 #4）。 @internal */
export const SSO_ACCESS_TOKEN_TTL_SECONDS = 120;

/**
 * SSO 访问令牌原语（oauth-sso-odoo-integration 切片 C）：手搓 HS256 紧凑 JWS 的铸发与验签。
 *
 * @remarks
 * 甲档本仓充当 Odoo 的极简 OIDC OP（单向·超短 TTL 对称 bearer），**非**完整 RS256 + JWKS 发现面，
 * 故不引 `jose`/`jsonwebtoken`（顶层不可解析·免新增依赖触供应链高危），直接用 `node:crypto` HMAC-SHA256。
 * 签名密钥复用 `auth.jwt.secret`（对称·与站内会话密钥同源，TTL 极短收敛风险）。`aud` 绑 client audience，
 * 验签时由调用方（userinfo 切片 D）强制校验 `aud` ∈ 已注册受众，防 confused-deputy（拿站内 JWT 冒充 SSO 令牌）。
 * @public
 */
@Injectable()
export class SsoTokenService {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  /** 铸发超短 TTL 访问令牌：`sub`=会话用户 id，`aud`=client audience。 */
  issue(sub: string, audience: string): SsoIssuedToken {
    const { secret } = this.configService.getAuthConfig().jwt;
    const iss = this.configService.getAppConfig().name;
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: SsoAccessTokenClaims = {
      sub,
      aud: audience,
      iss,
      iat: now,
      exp: now + SSO_ACCESS_TOKEN_TTL_SECONDS,
      jti: randomUUID(),
    };
    const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
    const signature = this.sign(signingInput, secret).toString('base64url');
    return {
      accessToken: `${signingInput}.${signature}`,
      tokenType: 'Bearer',
      expiresIn: SSO_ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * 验签并解出 claims：验 HMAC 签名 + `exp` 未过期；`aud` 归属由调用方策略判定。
   * @param token - 紧凑 JWS。
   * @returns 合法时返回 claims；签名不符 / 结构非法 / 过期时返回 `null`（fail-closed）。
   */
  verify(token: string): SsoAccessTokenClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expected = this.sign(signingInput, this.configService.getAuthConfig().jwt.secret);
    const provided = Buffer.from(encodedSignature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    let claims: SsoAccessTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (typeof claims.sub !== 'string' || typeof claims.aud !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  }

  private sign(signingInput: string, secret: string): Buffer {
    return createHmac('sha256', secret).update(signingInput).digest();
  }
}

/** JSON → base64url（无填充）。 @internal */
function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

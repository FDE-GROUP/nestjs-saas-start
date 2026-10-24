import { Public } from '@core/saas-kit/tenant-isolation/public.decorator';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import { Controller, Get, Headers, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { authorizeQuerySchema, type OauthAuthorizeQuery } from '@saas/contracts/index';
import type { FastifyReply } from 'fastify';
import { OauthSsoService } from '../infrastructure/oauth-sso.service';
import type { SessionRequest } from './guards/session.guard';

/**
 * OAuth2 授权端点（本仓充当 Odoo 的 OIDC OP·oauth-sso-odoo-integration 切片 C）。
 *
 * @remarks
 * `GET /api/v1/oauth2/authorize`（隐式流·Odoo `auth_oauth` 只发 `response_type=token`）。
 * **落 `/oauth2/*` 而非 `/auth/*`**：BA 原生 HTTP 面经 `AuthBootstrapService` 以 Fastify 实例级
 * 通配 `app.all('/api/v1/auth/*')` 挂载并**绕开 Nest router/guard/validation 三层**——SSO OP 是我方
 * Nest controller 面，置于 BA 前缀内会被通配抢路由，故隔离在 `/oauth2/*`（回改 plan 留痕·见 §7 v0.4.0）。
 * 默认走全局 `SessionGuard`（deny-by-default·未登录 401），**不标 `@Public()`**：授权须绑已认证会话。
 * 标 `@TenantIsolationExempt()`：SSO 是跨租户身份提供方（OP）面，已认证但合法无租户上下文——
 * 否则全局 `TenantIsolationGuard`（deny-by-default 租户墙）会对此面未绑活跃租者 403 死锁。
 * 用 `@Res()` 直发 302，绕开全局 `TransformInterceptor`（重定向无 JSON 信封）。
 * @public
 */
@ApiTags('oauth-sso')
@Controller('oauth2')
export class OauthSsoController {
  constructor(@Inject(OauthSsoService) private readonly oauthSso: OauthSsoService) {}

  /**
   * 处理隐式流授权：校验 client/redirect 白名单后，铸超短 TTL 令牌并 302 回跳带 fragment。
   * @param query - authorize 入参（经 zod 契约校验）。
   * @param req - 请求（`SessionGuard` 已挂 `sessionUser`）。
   * @param reply - Fastify reply（直发 302）。
   */
  @Get('authorize')
  @TenantIsolationExempt()
  @ApiOperation({
    summary: 'OAuth2 implicit-flow authorization endpoint (this repo acts as Odoo auth_oauth OP)',
  })
  @ApiResponse({ status: 302, description: 'Redirect to whitelisted redirect_uri#access_token=…' })
  @ApiResponse({
    status: 400,
    description: 'Unregistered client_id or redirect_uri not in whitelist.',
  })
  @ApiResponse({ status: 401, description: 'No authenticated session (global session wall).' })
  authorize(
    @Query({ schema: authorizeQuerySchema }) query: OauthAuthorizeQuery,
    @Req() req: SessionRequest,
    @Res() reply: FastifyReply,
  ): void {
    const session = req.sessionUser;
    if (!session) {
      reply.code(401).send({ message: 'Missing or invalid session' });
      return;
    }
    reply.code(302).redirect(this.oauthSso.buildAuthorizeRedirect(query, session));
  }

  /**
   * 返回已验令牌主体的 OIDC userinfo（`{ sub, email, name }`）。
   *
   * @remarks
   * `@Public()` 旁路会话墙（Odoo 服务端携 Bearer 回源·无 BA cookie 会话）；自带 Bearer 验签 +
   * `aud` 强制校验。用 `@Res().send(obj)` 发**裸 JSON**（非本站 `{data,...}` 信封）——否则 Odoo
   * `auth_oauth` 解析 `sub/email` 失败。错误（验签/`aud`/未验证）由服务抛异常→全局 filter 出错误信封。
   * @param authorization - `Authorization` 头（`Bearer <token>`）。
   * @param reply - Fastify reply（直发裸 JSON）。
   */
  @Get('userinfo')
  @Public()
  @ApiOperation({
    summary: 'OIDC userinfo (Bearer access token; returns raw JSON, not the API envelope)',
  })
  @ApiResponse({ status: 200, description: 'Raw OIDC claims { sub, email, name }.' })
  @ApiResponse({ status: 401, description: 'Missing/invalid token or audience not authorized.' })
  @ApiResponse({ status: 403, description: 'Email not verified.' })
  async userinfo(
    @Headers('authorization') authorization: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    reply.send(await this.oauthSso.resolveUserInfo(authorization));
  }
}

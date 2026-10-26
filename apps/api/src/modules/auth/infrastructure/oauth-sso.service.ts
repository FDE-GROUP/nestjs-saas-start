import { ConfigService } from '@app/config/config.service';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { canUseOdoo } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import {
  ORGANIZATION_ODOO_BINDING_READER,
  type OrganizationOdooBindingReader,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { OauthAuthorizeQuery, OauthUserInfo } from '@saas/contracts/index';
import type { SessionUser } from '../api/guards/session.guard';
import { User } from './entities/ba-identity.entities';
import { SsoTokenService } from './sso-token.service';

/**
 * SSO 授权服务（oauth-sso-odoo-integration 切片 C）：client 白名单解析 + redirect_uri 精确校验 + 铸发重定向。
 *
 * @remarks
 * authorize 端点的业务逻辑单源（controller 保持薄）。校验序（全 fail-closed）：
 * 1. `client_id` 必命中已注册 client（未注册即拒——不重定向到未登记地址，防开放重定向）；
 * 2. `redirect_uri` 与登记白名单**逐字节精确**匹配（前缀/子串匹配可被 `evil.com/?x=` 绕过）；
 * 3. 铸超短 TTL `aud` 绑定令牌，拼隐式流 fragment（`#access_token=…&token_type=Bearer&state=…`）。
 * `response_type`/`scope` 的协议合法性已在传输层（zod 契约 + 校验管道）拒入，此处不重复。
 * @public
 */
@Injectable()
export class OauthSsoService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(SsoTokenService) private readonly ssoToken: SsoTokenService,
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(ORGANIZATION_ODOO_BINDING_READER)
    private readonly bindings: OrganizationOdooBindingReader,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
  ) {}

  /**
   * 校验入参并构造隐式流重定向目标 URL（铸令牌前附 Odoo 可用性 fail-closed 门禁·切片 D）。
   * @param query - 已通过 zod 契约的 authorize 入参。
   * @param session - 会话墙挂上的已认证主体。
   * @returns 302 重定向目标（`redirect_uri#access_token=…`）。
   * @throws {BadRequestException} client 未注册或 redirect_uri 不在精确白名单。
   * @throws {ForbiddenException} 活跃租户 Odoo 未就绪（`canUseOdoo` 假/无活跃租户·铸令牌前阻断）。
   */
  async buildAuthorizeRedirect(query: OauthAuthorizeQuery, session: SessionUser): Promise<string> {
    const client = this.configService
      .getOauthSsoConfig()
      .clients.find((c) => c.clientId === query.client_id);
    if (!client) {
      throw new BadRequestException('unregistered client_id');
    }
    if (!client.redirectUris.includes(query.redirect_uri)) {
      throw new BadRequestException('redirect_uri not in exact whitelist');
    }
    // Odoo 可用性 fail-closed（裁点④·切片 D）：SSO 是入 Odoo 的唯一通道，铸令牌前以会话活跃
    // 租户跑 `canUseOdoo` 单源裁决（与 apps 面板/RPC 域注入同口径）——非 ready/suspended/未绑定/无活跃租户一律 403，
    // 使「审批通过」不即「Odoo 可入」（建司慢/失败/已挂起均拦在门外）。本端点标 `@TenantIsolationExempt`（跨租 OP），
    // 故用软读 `organizationId`（无活跃租户 = 不可入 Odoo），非 requireActiveOrganizationId 的 403。
    const organizationId = this.tenant.organizationId;
    const binding = organizationId ? await this.bindings.read(organizationId) : null;
    if (
      !binding ||
      !canUseOdoo({
        status: binding.organizationStatus,
        odooBindingStatus: binding.odooBindingStatus,
        odooCompanyId: binding.odooCompanyId,
      })
    ) {
      throw new ForbiddenException('Odoo not available for the active organization', {
        errorCode: ERROR_CODES.ORG_ODOO_BINDING_NOT_READY,
      });
    }
    const issued = this.ssoToken.issue(session.id, client.audience);
    const fragment = new URLSearchParams({
      access_token: issued.accessToken,
      token_type: issued.tokenType,
      expires_in: String(issued.expiresIn),
    });
    if (query.state !== undefined) fragment.set('state', query.state);
    // fragment 与 redirect_uri 既有 `#` 以 `&` 续接（RFC 6749 §4.2.2 严格语法）；Odoo 缺省不带 `#`。
    const sep = query.redirect_uri.includes('#') ? '&' : '#';
    return `${query.redirect_uri}${sep}${fragment.toString()}`;
  }

  /**
   * 验 Bearer 访问令牌并解出裸 OIDC userinfo（oauth-sso-odoo-integration 切片 D）。
   * @param rawAuthorization - `Authorization` 头原值（须 `Bearer <token>`·Odoo 侧置 `authorization_header=true`）。
   * @returns 权威 `{ sub, email, name }`（取 user 表实时值·非令牌 claims）。
   * @throws {UnauthorizedException} 头缺失/非法、验签失败、`aud` 不符、主体查无。
   * @throws {ForbiddenException} 邮箱未验证（硬门·风险 #3 建号治理前置）。
   */
  async resolveUserInfo(rawAuthorization: string | undefined): Promise<OauthUserInfo> {
    const token = extractBearer(rawAuthorization);
    if (!token) throw new UnauthorizedException('Missing or malformed Authorization header');
    const claims = this.ssoToken.verify(token);
    if (!claims) throw new UnauthorizedException('Invalid or expired access token');
    // 强制 `aud` 校验（补位 Odoo CE 缺的 audience 校验·风险 #4 confused-deputy）：只认本 OP 为已注册受众铸的令牌。
    const audiences = new Set(
      this.configService.getOauthSsoConfig().clients.map((c) => c.audience),
    );
    if (!audiences.has(claims.aud))
      throw new UnauthorizedException('access token audience not authorized');
    // 身份取 user 表实时权威值（非令牌内嵌 claims·防落库后 PII 漂移）。
    const em = await this.mikro.fork();
    const user = await em.findOne(User, { id: claims.sub });
    if (!user) throw new UnauthorizedException('unknown subject');
    if (!user.emailVerified) throw new ForbiddenException('email not verified');
    return { sub: user.id, email: user.email, name: user.name };
  }
}

/** 从 `Authorization` 头解出 Bearer 令牌（大小写不敏感）；不合规则 `null`。 @internal */
function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const matched = /^Bearer\s+(.+)$/i.exec(header.trim());
  return matched?.[1] ?? null;
}

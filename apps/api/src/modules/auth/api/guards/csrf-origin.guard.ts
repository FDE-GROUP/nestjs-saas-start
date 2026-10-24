import { ConfigService } from '@app/config/config.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { IS_PUBLIC_KEY } from '@core/saas-kit/tenant-isolation/public.decorator';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** 安全方法（不改变状态）→ CSRF 不适用。 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 本守卫读取的最小请求形状（结构化·适配无关）。 */
interface CsrfRequestLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * CSRF Origin/Referer 校验守卫（会话墙后的第二道纵深防御）。
 *
 * @remarks
 * 经 `AuthModule` 注册为全局 `APP_GUARD`，排在 `SessionGuard` 之后（401 先 403）：对**依赖
 * cookie 会话**的**非安全方法**做 Origin 校验——补上「非 auth 端点仅靠 SameSite 缺省 lax」的
 * 纵深防御缺口（生产若翻 SameSite=None 支持跨源前端，此墙独立兜底）。
 *
 * 判据（乙·同源部署取向）：
 * - `@Public()` 面（存活探针 / 签名校验入站回调 / Stripe webhook）不依赖会话 → 跳过；
 * - **同源放行**：`Origin` 的 host 命中请求自身 `Host`/`X-Forwarded-Host` → 放行（scheme 无关；
 *   攻击者无法伪造受害者请求的 Host 头，故同源天然安全·免登记本站 origin）；
 * - 可信源白名单**复用 CORS 单一真源** `getCorsConfig().origin`（= `ALLOWED_ORIGINS`），不另立门户（覆盖跨源合法前端）；
 * - 无 Origin/Referer（非浏览器 / 服务直连）→ 放行 + warn（镜 IP-trust「warn 非 fail-closed」，防误杀纯 API 后端）；
 * - 有 Origin 且既非同源亦不在白名单 → 403 `AUTH:CSRF_ORIGIN_MISMATCH`。
 * @public
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfOriginGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  /**
   * 对非安全方法执行 Origin 校验：`@Public` 与安全方法放行，同源/白名单放行，否则 403。
   * @param context - 执行上下文。
   * @returns 放行时为 `true`；校验失败时抛 403。
   */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<CsrfRequestLike>();
    const method = (req.method ?? '').toUpperCase();
    if (SAFE_METHODS.has(method)) return true;

    const origin = this.extractOrigin(req.headers ?? {});
    if (!origin) {
      this.logger.warn(`state-changing ${method} 无 Origin/Referer：CSRF 校验跳过（warn 非拦截）`);
      return true;
    }

    if (this.isSameOrigin(origin, req.headers ?? {})) return true;

    const allow = this.trustedOrigins();
    if (allow.has('*') || allow.has(origin)) return true;

    throw new ForbiddenException('CSRF origin check failed', {
      errorCode: ERROR_CODES.AUTH_CSRF_ORIGIN_MISMATCH,
    });
  }

  /** Origin 优先，缺失回退 Referer 的 origin（Fastify 头名小写）。 */
  private extractOrigin(headers: Record<string, string | string[] | undefined>): string | null {
    const origin = headers.origin;
    if (typeof origin === 'string' && origin.length > 0) return origin;
    const referer = Array.isArray(headers.referer) ? headers.referer[0] : headers.referer;
    if (typeof referer === 'string' && referer.length > 0) {
      try {
        return new URL(referer).origin;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** 同源判定：Origin 的 host（含端口·小写）命中请求自身 Host / X-Forwarded-Host（scheme 无关）。 */
  private isSameOrigin(
    origin: string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return false;
    }
    const fwd = headers['x-forwarded-host'];
    const candidate = (Array.isArray(fwd) ? fwd[0] : fwd) || headers.host;
    const reqHost = (Array.isArray(candidate) ? candidate[0] : candidate)?.trim().toLowerCase();
    return !!reqHost && reqHost === originHost;
  }

  /** 可信源集合：与 CORS 同源（ALLOWED_ORIGINS 解析所得 origin）。 */
  private trustedOrigins(): Set<string> {
    const { origin } = this.configService.getCorsConfig();
    const list = Array.isArray(origin) ? origin : [origin];
    return new Set(list.filter(Boolean));
  }
}

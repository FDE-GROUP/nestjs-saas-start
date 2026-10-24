import { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { IS_PUBLIC_KEY } from '@core/saas-kit/tenant-isolation/public.decorator';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthInstanceInjectKey } from '../../auth.constant';
import type { InjectAuthInstance } from '../../auth.interface';
import { resolveRequestSession } from '../../infrastructure/session-resolver';

/**
 * 已认证主体形状（由 `SessionGuard` 挂到请求上）。
 *
 * @remarks
 * Shape of an authenticated principal attached to the request by SessionGuard.
 * Kept intentionally narrow — only the fields the PIPL /users/me/* endpoints need.
 * @public
 */
export interface SessionUser {
  /** 用户 id。 */
  id: string;
  /** 邮箱地址。 */
  email: string;
}

/**
 * `SessionGuard` 读/写的最小请求形状。
 *
 * @remarks
 * Minimal request shape SessionGuard reads/writes. Avoids coupling to a specific
 * HTTP adapter (Fastify vs Express); Nest's `switchToHttp()` supplies a compatible object.
 * @public
 */
export interface SessionRequest {
  /** 请求头。 */
  headers: Record<string, string | string[] | undefined>;
  /** 会话解析出的用户。 */
  sessionUser?: SessionUser;
}

/**
 * 会话墙全局守卫：从请求头解析 Better Auth 会话并挂 `req.sessionUser`，否则抛 401。
 *
 * @remarks
 * Resolves the Better Auth session from the incoming request headers.
 * Attaches `req.sessionUser` on success; otherwise throws 401.
 *
 * S11 · 高危#4 收口：本守卫经 `AuthModule` 注册为全局 `APP_GUARD`（deny-by-default 会话墙），
 * 所有路由默认要求已登录会话。仅显式标注 `@Public()` 的路由（存活探针、签名校验的入站回调）
 * 经 `Reflector` 读回旁路元数据后放行。其余守卫（TenantIsolation/Authorization/PlatformOperator/Quota）
 * 仍逐路由叠加，运行于本全局守卫**之后**。`UserStatusService` 暂停联动保持纵深防御（403）。
 * @public
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(UserStatusService) private readonly userStatus: UserStatusService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  /**
   * 解析并校验会话：`@Public` 路由旁路，否则无会话 401、已暂停 403。
   * @param context - 执行上下文。
   * @returns 放行时为 `true`；否则抛异常。
   *
   * @throws {UnauthorizedException} 会话缺失或非法时。
   * @throws {ForbiddenException} 账号已停用时。
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // S11 · deny-by-default：显式 @Public 的路由（handler 优先于 class）跳过会话墙。
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<SessionRequest>();
    const auth = this.authInstance.get();
    if (!auth)
      throw new UnauthorizedException('Auth instance not initialized', {
        errorCode: ERROR_CODES.AUTH_PROVIDER_UNAVAILABLE,
      });

    const result = await resolveRequestSession(auth, req);
    if (!result?.user?.id)
      throw new UnauthorizedException('Missing or invalid session', {
        errorCode: ERROR_CODES.AUTH_SESSION_INVALID,
      });

    // S6 · FR-10: platform-suspended users are fail-closed at the user layer too
    // (defense-in-depth alongside session hard-invalidation — catches a re-login bypass).
    const userId = String(result.user.id);
    if (await this.userStatus.isBlocked(userId))
      throw new ForbiddenException('Account suspended', {
        errorCode: ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      });

    req.sessionUser = { id: userId, email: String(result.user.email ?? '') };
    return true;
  }
}

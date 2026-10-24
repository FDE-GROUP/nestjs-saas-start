import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../shared-kernel/errors/error-codes';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantIsolationService } from './tenant-isolation.service';
import { IS_TENANT_ISOLATION_EXEMPT_KEY } from './tenant-isolation-exempt.decorator';

/**
 * 租户作用域路由的 fail-closed 闸门（global-tenancy §9.3 / FR-5·数据隔离边界种子）。
 *
 * @remarks
 * Fail-closed gate for tenant-scoped routes (global-tenancy §9.3 / FR-5, seed of the
 * data-isolation boundary). It only asserts that an active tenant has been resolved for
 * the request (by `TenantIsolationMiddleware` into AsyncLocalStorage); the actual row filtering is
 * enforced centrally in the repository adapter, so no handler scatters `where tenant_id`
 * by hand.
 *
 * S11 · 高危#4 复合全局：本守卫经 `TenantIsolationModule` 注册为全局 `APP_GUARD`（deny-by-default 租户墙），
 * 运行于全局会话墙之后（`AppModule` 中 `AuthModule` 先于 `TenantIsolationModule` → 401 先于 403）。所有
 * 路由默认要求已绑定 active 租户；唯显式旁路可豁免：`@Public()`（无会话=无租户·认证面/webhook）
 * 或 `@TenantIsolationExempt()`（需会话但合法无租户·建租申请/跨租治理/个人 PIPL/用户级 storage·payment）。
 * 元数据经 `Reflector.getAllAndOverride` 读回（handler 优先 class·同 `AuthorizationGuard` 口径）。
 * 逐路由 `@UseGuards(TenantIsolationGuard)` 仍可与全局并存（幂等·无短路冲突）。
 *
 * @public
 */
@Injectable()
export class TenantIsolationGuard implements CanActivate {
  constructor(
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  /**
   * 裁决：`@Public`/`@TenantIsolationExempt` 任一即旁路；否则无活动租户抛 403。
   *
   * @param context - Nest 执行上下文（取 handler/class 元数据 + 租户会话）
   * @returns 放行返回 `true`；否则抛 `ForbiddenException`
   *
   * @throws {ForbiddenException} 无活动租户上下文时。
   */
  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    // @Public 蕴含无会话→无租户；@TenantIsolationExempt 需会话但跳过租户墙。二者任一即旁路。
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(IS_TENANT_ISOLATION_EXEMPT_KEY, targets)
    ) {
      return true;
    }
    if (!this.tenant.organizationId) {
      throw new ForbiddenException('No active organization context', {
        errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
      });
    }
    return true;
  }
}

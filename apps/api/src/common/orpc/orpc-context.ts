import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { SessionRequest, SessionUser } from '../../modules/auth/api/guards/session.guard';

/**
 * oRPC 请求上下文（换轨 WP-C）：把 Nest 守卫链（`SessionGuard`）已挂到 request 上的
 * **已认证主体**接入 oRPC procedure 的 `context`，取代旧 REST 的 `@CurrentUser()` 参数装饰器。
 *
 * @remarks
 * 为何经 `DefaultInitialContext` 模块增强而非 `os.$context<T>()`：
 * - `.$context` 在挂中间件（中央 `os` 已 `.use(restErrorMiddleware)`）后不可再调（见 @orpc/server 类型注释）；
 * - 直接增强 `DefaultInitialContext` 令**所有** `@Impl` procedure 的 `context` 静态携 `user?`，
 *   且因字段全可选，既有零 DB 单测里裸 `call(procedure)` 仍合法（context 可省）。
 *
 * **安全语义不弱化**：`user` 仍只由 `SessionGuard` 在守卫层写入（deny-by-default 会话墙），
 * context 工厂仅**转读** `req.sessionUser`，绝不在此重解析/放宽；`@Public`/未登录路由即 `undefined`。
 * 租户轴不取 context——其沿用既有 ALS（`RequestContext`）单源，与 posts/workspaces 一致。
 */
declare module '@orpc/server' {
  interface DefaultInitialContext {
    /** 由 `SessionGuard` 挂载的已认证主体；未登录（`@Public`）路由为 `undefined`。 */
    user?: SessionUser;
    /**
     * 原始请求头（取代旧 REST `@Headers()` 全量参数）·供 BA 服务端直调透传（个人通道 list/setActive）。
     * 仅**转读** `req.headers`·不重解析/改写。
     */
    headers?: Record<string, unknown>;
  }
}

/**
 * oRPC context 工厂（经 `ORPCModule.forRoot({ context })` 全局注入）：从 Nest `ExecutionContext`
 * 转读守卫已挂的 `req.sessionUser`（主体）与 `req.headers`（BA 透传面）。
 */
export function createOrpcContext(ctx: ExecutionContext): {
  user?: SessionUser;
  headers?: Record<string, unknown>;
} {
  const req = ctx.switchToHttp().getRequest<SessionRequest>();
  return { user: req.sessionUser, headers: req.headers };
}

/**
 * 取已认证主体（fail-closed 型收窄）：`SessionGuard` 已在守卫层保证登录（未登录 401 先于 handler），
 * 故正常路径下 `context.user` 必存在；本函数仅作类型收窄 + 防御性兼平（万一未挂 → 401·不静默放行）。
 */
export function requireSessionUser(context: { user?: SessionUser }): SessionUser {
  if (!context.user) {
    throw new UnauthorizedException('Missing or invalid session.');
  }
  return context.user;
}

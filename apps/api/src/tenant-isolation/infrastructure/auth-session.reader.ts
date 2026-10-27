import {
  AUTH_BYPASS_PATHS,
  AUTH_SURFACE_PATH,
  AuthInstanceInjectKey,
} from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { resolveRequestSession } from '@app/modules/auth/infrastructure/session-resolver';
import type {
  RequestSessionReader,
  SessionRequestLike,
  SessionView,
} from '@core/saas-kit/tenant-isolation/session/request-session.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `RequestSessionReader` 的参考应用侧适配（§9.5.4①B · P1b）。
 *
 * 把「廉价短路（无 cookie / 旁路 / auth 路由 → 不触发会话查询）」与 Better Auth 会话解析
 * （`resolveRequestSession`·`WeakMap` 按请求记忆·跨守卫复用一次 getSession）封装在应用侧，
 * 仅向 core 透出标量 `SessionView`。auth 实例经全局 `AuthInstanceInjectKey` 注入（`AuthModule.forRoot`
 * 声明 `global: true`）。会话未解析出（null）归一为「无租户上下文」返回 null。
 *
 * global-role-membership-tenantization 切片 C 换源：本 reader **不再**从 BA 数据面（原
 * `getActiveMemberRole` org 维）取成员角色——会话角色改由中间件在活动租户解析后经
 * `TENANT_SCOPE_RESOLVER.resolveTenantRole` 从自有 `tenant_role_assignment` 供（角色只随活动租户·
 * 切 org 不翻角色）。SessionView 自此不再携带 `role`。
 */

/**
 * 完整路径段对齐匹配（module-tenancy-session-path-match）：先剥 query/hash，再按斜杠切段，
 * 仅当 needle 的段序列**连续且段边界对齐**出现在路径段中才命中。修子串地雷——
 * `/api/v1/auth/*` 命中 `/auth`，但 `/api/v1/authors`、`?next=/auth` 均不命中。
 */
export function pathSegmentMatch(url: string, needle: string): boolean {
  const segs = url.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  const nsegs = needle.split('/').filter(Boolean);
  if (nsegs.length === 0 || segs.length < nsegs.length) return false;
  for (let i = 0; i <= segs.length - nsegs.length; i++) {
    if (nsegs.every((s, j) => segs[i + j] === s)) return true;
  }
  return false;
}

@Injectable()
export class AuthSessionReader implements RequestSessionReader {
  constructor(@Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance) {}

  async read(req: SessionRequestLike): Promise<SessionView | null> {
    const url = (req?.originalUrl || req?.url || '') as string;
    // 廉价路径：无 cookie / 认证 / 旁路 / health 路由 → 不做任何会话查询（段对齐·防子串误撞）。
    if (
      !req?.headers?.cookie ||
      AUTH_BYPASS_PATHS.some((p) => pathSegmentMatch(url, p)) ||
      pathSegmentMatch(url, AUTH_SURFACE_PATH)
    ) {
      return null;
    }

    const auth = this.authInstance.get();
    if (!auth) return null;

    const result = await resolveRequestSession(
      auth,
      req as { headers: Record<string, string | string[] | undefined> },
    );
    if (!result) return null;

    const userId = result.user?.id ? String(result.user.id) : undefined;
    const activeOrganizationId = result.session?.activeOrganizationId ?? undefined;
    // 切片 4·D7：BA getSession 依声明的 session additionalField 自动回读 `activeTenantId`（服务端写·客户端不可塞）。
    const activeTenantId =
      (result.session as { activeTenantId?: string | null } | undefined)?.activeTenantId ??
      undefined;
    // 既无活动组织也无显式激活租 → 仅回身份（无租户上下文·下游 fail-closed）。有其一即继续。
    // 切片 C 换源：会话角色不再在此从 BA 取（已删 getActiveMemberRole 链）——由中间件按活动租户经
    // `TENANT_SCOPE_RESOLVER.resolveTenantRole` 从自有 `tenant_role_assignment` 解析。
    return { userId, activeOrganizationId, activeTenantId };
  }
}

import {
  AUTH_BYPASS_PATHS,
  AUTH_SURFACE_PATH,
  AuthInstanceInjectKey,
} from '@app/modules/auth/auth.constant';
import type { AuthInstance, InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { resolveRequestSession } from '@app/modules/auth/infrastructure/session-resolver';
import type { OrganizationRole } from '@core/saas-kit/authorization/tenant-rules';
import type {
  RequestSessionReader,
  SessionRequestLike,
  SessionView,
} from '@core/saas-kit/tenancy/session/request-session.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `RequestSessionReader` 的参考应用侧适配（§9.5.4①B · P1b）。
 *
 * 把「廉价短路（无 cookie / 旁路 / auth 路由 → 不触发会话查询）」与 Better Auth 会话解析
 * （`resolveRequestSession`·`WeakMap` 按请求记忆·跨守卫复用一次 getSession）封装在应用侧，
 * 仅向 core 透出标量 `SessionView`。auth 实例经全局 `AuthInstanceInjectKey` 注入（`AuthModule.forRoot`
 * 声明 `global: true`）。会话未解析出（null）归一为「无租户上下文」返回 null。
 *
 * module-rbac-casl 丙裁：额外在**有活动租户时**从 BA 数据面（`getActiveMemberRole`）取当前
 * 成员角色注入 `SessionView.role`（按请求 WeakMap 记忆·与 resolveRequestSession 同构模式）。
 * 角色是认证域事实（membership 数据），不是裁决——裁决在 CASL 侧。
 * 注：BA **服务端** API 面方法名为 `listOrganizations`/`getActiveMemberRole`（client 面的
 * `getOrganizationList` 不存在于 server 端·源码 organization.mjs 路由表对拍）；且
 * `listOrganizations` 返回纯 org 字段不带 role，角色只能经 getActiveMemberRole 取。
 */

/** 按请求记忆活动租户角色，避免同一请求多次 membership 读取。 */
const roleCache = new WeakMap<SessionRequestLike, OrganizationRole | undefined>();

/**
 * BA role 字符串透传归一（module-rbac-dynamic-roles 丙裁：角色是 DB 运行时词汇，系统三 key
 * + 自定义 key 皆合法，不再按封闭词汇表拦截）；非法值（非 string/空串）→ undefined·
 * 消费侧 fail-closed。合法性（角色存在且有授权）由投影侧查 DB grant 行裁决，非本处职责。
 */
function toOrganizationRole(raw: unknown): OrganizationRole | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/**
 * 从 BA 数据面取当前用户在活动租户内的成员角色（module-rbac-casl 丙裁）。
 * `getActiveMemberRole` 按会话 `activeOrganizationId` 直取 `{ role }`（membership 数据事实）；
 * 失败/非成员 → undefined（guard 侧 fail-closed 拒）。
 */
async function resolveActiveRole(
  auth: AuthInstance,
  req: SessionRequestLike,
): Promise<OrganizationRole | undefined> {
  const hit = await auth.api.getActiveMemberRole({
    headers: req.headers as unknown as Headers,
  });
  return toOrganizationRole((hit as { role?: unknown } | undefined)?.role);
}

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
    if (!activeOrganizationId) return { userId };

    // 有活动租户才付 membership 角色读（按请求记忆·has() 判命中避免与 undefined 值混淆）。
    if (!roleCache.has(req)) {
      const role = await resolveActiveRole(auth, req).catch(() => undefined);
      roleCache.set(req, role);
    }
    return { userId, activeOrganizationId, role: roleCache.get(req) };
  }
}

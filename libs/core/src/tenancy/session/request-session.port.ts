import type { OrganizationRole } from '../../authorization/tenant-rules';

/**
 * 请求会话读取端口（global-tenancy §9.5.4①B · P1b 会话端口倒置）。
 *
 * tenancy core 需知道「本次请求的可信会话」（用户 id + 当前活跃租户 id），但**不得** import
 * Better Auth 实例 / `@app/modules/auth`。核心只消费本端口，`AuthInstanceInjectKey` +
 * `resolveRequestSession` 的会话解析细节由参考应用侧适配（`infrastructure/auth-session.reader`）提供。
 *
 * `read` 返回 `null` 表示「无租户上下文」——公开 / auth / 旁路路由、无 cookie、auth 未初始化或
 * 会话未解析出，均归一为 null，故 core 完全不感知认证实现，也不会在旁路路由触发 getSession 查询。
 */

export const SESSION_READER = Symbol('SESSION_READER');

/** 会话读取所需的最小请求形状（结构化·core-safe·不含任何 Better Auth 类型）。 */
export interface SessionRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  originalUrl?: string;
}

/** 透出给 tenancy core 的可信会话视图（仅标量·跨包安全）。 */
export interface SessionView {
  readonly userId?: string;
  readonly activeOrganizationId?: string;
  /**
   * 当前用户在 `activeOrganizationId` 租户内的成员角色（module-rbac-casl 丙裁：会话解析点
   * 预注入）。来自 BA membership **数据面**（认证域事实）；词汇外/无活动租户 → undefined，
   * 消费侧（TenantPermissionGuard）据此 fail-closed。裁决不在本层。
   */
  readonly role?: OrganizationRole;
}

export interface RequestSessionReader {
  read(req: SessionRequestLike): Promise<SessionView | null>;
}

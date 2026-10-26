import type { TenantRole } from '../../authorization/authorization-rules';

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

/**
 * 请求会话读取端口的 DI 注入 token。
 *
 * @public
 */
export const SESSION_READER = Symbol('SESSION_READER');

/**
 * 会话读取所需的最小请求形状（结构化·core-safe·不含任何 Better Auth 类型）。
 *
 * @public
 */
export interface SessionRequestLike {
  /** 请求头。 */
  headers?: Record<string, string | string[] | undefined>;
  /** 请求 URL。 */
  url?: string;
  /** 原始请求 URL。 */
  originalUrl?: string;
}

/**
 * 透出给 tenancy core 的可信会话视图（仅标量·跨包安全）。
 *
 * @public
 */
export interface SessionView {
  /** 用户 id。 */
  readonly userId?: string;
  /** 当前活动租户 id。 */
  readonly activeOrganizationId?: string;
  /**
   * 当前用户在 `activeOrganizationId` 租户内的成员角色（module-rbac-casl 丙裁：会话解析点
   * 预注入）。来自 BA membership **数据面**（认证域事实）；词汇外/无活动租户 → undefined，
   * 消费侧（AuthorizationGuard）据此 fail-closed。裁决不在本层。
   */
  readonly role?: TenantRole;
}

/**
 * 请求会话读取器端口（读可信会话视图·无则 null）。
 *
 * @public
 */
export interface RequestSessionReader {
  /**
   * 读取本次请求的可信会话视图。
   *
   * @param req - 最小请求形状（headers/url）
   * @returns 会话视图；无租户上下文（公开/auth/旁路/无 cookie）返回 `null`
   */
  read(req: SessionRequestLike): Promise<SessionView | null>;
}

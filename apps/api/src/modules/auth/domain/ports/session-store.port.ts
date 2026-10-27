/**
 * `AuthSessionStore` 端口的 DI 注入 token。
 * @public
 */
export const AUTH_SESSION_STORE = Symbol('AUTH_SESSION_STORE');

/**
 * 平台治理对 Better Auth `session` 表的**受控写入口**（架构精度修宪 S3）。
 *
 * @remarks
 * 缘起：`suspend-user` 此前在 command handler 里 `em.nativeDelete(Session)` 直捅 auth
 * 上下文的表——写路径绕端口 + 跨上下文越界，且在 UoW 之外（状态已 suspend 而 session
 * 删除失败会留失权窗口）。本端口把该写收归 auth 上下文单点；适配器经
 * `MikroOrmService.fork()`（**ALS 感知**：活跃 UoW 事务内返回事务 em），调用方包
 * `uow.run` 即得「状态写 + session 删」同事务原子。
 * @public
 */
export interface AuthSessionStore {
  /**
   * 删除某用户全部 session 行（即时失权）。
   * @param userId - 用户主键。
   * @returns 删除行数。
   */
  deleteAllForUser(userId: string): Promise<number>;
  /**
   * 写会话的租级激活位 `activeTenantId`（第三次层级复裁 切片 4·D7 租户激活解绑）：
   * 按会话主键 `sessionId` 直写单行真列（不依赖 ALS 租户上下文·租级激活面本身尚无活动租）。
   * 调用方（设活动租户 handler）**必须先校成员资格**（防跨租提权）·本端口只负责受控写入。
   * @param sessionId - 会话主键（由已验签会话派生·可信）。
   * @param tenantId - 目标租户 id（已验成员资格）。
   * @returns 受影响行数（0 → 会话不存在）。
   */
  setActiveTenant(sessionId: string, tenantId: string): Promise<number>;
  /**
   * 清会话租级激活位 `activeTenantId`（P0 修复 X2·双激活位互斥）：与 `setActiveTenant` 反向成对。
   * 切活动组织时调用——选 org 与选租互斥，不清则遗留 `{activeTenantId=T1, activeOrganizationId=O2∈T2}`
   * 混态 → 中间件显式优先绑 T1、role 却取自 O2 membership → 租内跨租借权。本端口只负责受控写入（清为 NULL）。
   * @param sessionId - 会话主键（由已验签会话派生·可信）。
   * @returns 受影响行数（0 → 会话不存在）。
   */
  clearActiveTenant(sessionId: string): Promise<number>;
}

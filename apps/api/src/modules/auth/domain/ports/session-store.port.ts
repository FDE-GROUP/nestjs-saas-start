/**
 * 平台治理对 Better Auth `session` 表的**受控写入口**（架构精度修宪 S3）。
 *
 * 缘起：`suspend-user` 此前在 command handler 里 `em.nativeDelete(Session)` 直捅 auth
 * 上下文的表——写路径绕端口 + 跨上下文越界，且在 UoW 之外（状态已 suspend 而 session
 * 删除失败会留失权窗口）。本端口把该写收归 auth 上下文单点；适配器经
 * `MikroOrmService.fork()`（**ALS 感知**：活跃 UoW 事务内返回事务 em），调用方包
 * `uow.run` 即得「状态写 + session 删」同事务原子。
 */
export const AUTH_SESSION_STORE = Symbol('AUTH_SESSION_STORE');

export interface AuthSessionStore {
  /** 删除某用户全部 session 行（即时失权）。返回删除行数。 */
  deleteAllForUser(userId: string): Promise<number>;
}

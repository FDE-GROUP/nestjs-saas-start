/**
 * 用户状态存储端口的 DI 注入 token（global-tenancy S10 · §9.5.4①B 端口倒置）。
 *
 * @remarks
 * `UserStatusService` 是用户生命周期状态的唯一读写卡点（S6 · FR-10），但 core 侧不应感知
 * 具体 `user` 表与旧实现。此端口抽象三个持久化原语，适配在参考应用实现（切片 C 后态居
 * `user.status` 真列·写经 AUTH_USER_STORE 落 auth 属主）。
 *
 * @public
 */
export const USER_STATUS_STORE = Symbol('USER_STATUS_STORE');

/**
 * 用户状态持久化端口：status 导向三原语（读态/判存/写态）。
 *
 * @public
 */
export interface UserStatusStore {
  /**
   * `user.status` 真列；本体不存在 → `undefined`（deny-list：视同 active）。
   *
   * @param userId - 目标用户 id
   * @returns 状态列值；无本体返回 `undefined`
   */
  readStatus(userId: string): Promise<string | undefined>;
  /**
   * 平台用户是否存在（`user` 表命中）——不存在则 transition 报 not-found。
   *
   * @param userId - 目标用户 id
   * @returns 命中返回 `true`；否则 `false`
   */
  userExists(userId: string): Promise<boolean>;
  /**
   * 写 `user.status`/`statusReason` 真列（经 auth 属主端口·存在则更新 status/reason/updatedAt）。
   *
   * @param userId - 目标用户 id
   * @param status - 迁移后状态
   * @param reason - 治理理由（可空）
   */
  upsert(userId: string, status: string, reason: string | null): Promise<void>;
}

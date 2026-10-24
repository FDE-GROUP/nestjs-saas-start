/**
 * `AuthUserStore` 端口的 DI 注入 token。
 * @public
 */
export const AUTH_USER_STORE = Symbol('AUTH_USER_STORE');

/**
 * 用户本体（`user` 表·身份机器族）的受控写入口（global-ba-entity-domain-placement 切片 A）。
 *
 * @remarks
 * 缘起：裁①定 `user` 表归 auth 域（台账 `user→auth`），users 模块的 PIPL 硬删从此经本端口走——
 * 与 `AUTH_SESSION_STORE`（S3 收编 session 越界写）同型先例：跨域对身份机器族表的写须经属主端口，
 * 禁绕行直捅 entity。users 模块自此对 user 表纯读（表所有权写侧纪律·例外清零）。
 * @public
 */
export interface AuthUserStore {
  /**
   * PIPL 硬删用户本体行（FK 级联 account/session；consent 为 set-null·event 表行由调用方显式补删）。
   * @param userId - 用户主键。
   */
  hardDelete(userId: string): Promise<void>;
  /**
   * 治理写用户生命周期态（global-governance-lifecycle-consolidation 切片 C）：直写 `user.status`
   * 真列 + `statusReason` 并盖 `updatedAt`（沿 PIPL 硬删同型——tenants 侧治理经本属主端口落 auth 表，
   * 消写侧越界·`UserStatusService` 不感知实现）。`transition` 已先 `userExists` 卡存本体，此处恒为 UPDATE。
   * @param userId - 用户主键。
   * @param status - 目标生命周期态。
   * @param reason - 迁移理由（可空）。
   */
  updateStatus(userId: string, status: string, reason: string | null): Promise<void>;
}

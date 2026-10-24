/**
 * Platform identity lookup 端口的 DI 注入 token（global-tenancy S10 · §9.5.4①B 端口倒置）。
 *
 * @remarks
 * `PlatformOperatorGuard` 据实读 DB email（非依赖 session 回传字段）判定唯一经营者（FR-13），
 * 但 core 侧不应感知 `user` 表与旧实现。此端口只暴露「userId → email」这一查询原语，
 * 旧 ORM 适配在参考应用实现。
 *
 * @public
 */
export const PLATFORM_IDENTITY_LOOKUP = Symbol('PLATFORM_IDENTITY_LOOKUP');

/**
 * 平台身份查询端口：按 userId 实读 DB email 的查询原语。
 *
 * @public
 */
export interface PlatformIdentityLookup {
  /**
   * 该用户的 DB email；查无此人 → `undefined`（fail-closed 由调用方裁决）。
   *
   * @param userId - 待查询的用户 id
   * @returns 解析出的 email；查无返回 `undefined`
   */
  emailOf(userId: string): Promise<string | undefined>;
}

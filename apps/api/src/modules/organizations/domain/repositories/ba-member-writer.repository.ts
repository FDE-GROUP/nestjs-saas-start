/**
 * `BaMemberDirectoryWriter` 端口的 DI 注入 token（切片 G·G1·领域自持·依赖倒置）。
 * @public
 */
export const BA_MEMBER_DIRECTORY_WRITER = Symbol('BA_MEMBER_DIRECTORY_WRITER');

/**
 * BA 遗留 `member` 轴的**属主侧清理写口**（切片 G·G1·双轴同步）。
 *
 * @remarks
 * `member` 表属主 = `organizations`（`table-ownership.ts`）：X7 换轴后角色/席位/可见性 SSOT 已上收
 * 自有 `tenant_membership`，但目录可见面（R3）取 `tenant_membership` ∪ BA `member` 派生租——故撤销
 * 租级成员（authorization 侧 `revokeMembership`）后，若不清 BA `member` 行，退租/被移除者仍可**见可切**该租。
 * 本端口让门面（organizations 上下文）经**同属主写面**连带清 BA 行（`nativeDelete(Member)` 落
 * organizations 目录·守 table-ownership 纪律·authorization 不越界写他属表）。best-effort：BA 轴为过渡观测，
 * 失败不回滚已成的租级撤销（撤权撤席 SSOT 已达成）。
 * @public
 */
export interface BaMemberDirectoryWriter {
  /**
   * 删除该 user 在指定租户**全部组织**下的 BA `member` 行（租级退租/移除 → 组织维成员一并撤）。
   * @param tenantId - 目标租户 id（据此圈定该租下的 org 集）。
   * @param userId - 被撤用户 id。
   * @returns 实删行数（无匹配 → 0）。
   */
  removeAcrossTenant(tenantId: string, userId: string): Promise<number>;
}

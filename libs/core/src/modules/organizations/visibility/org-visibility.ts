/**
 * 每租户租内跨组织可见性策略词汇（第三次复裁 · 切片 3 · D2/评审 pt1）·纯函数·零框架依赖。
 *
 * @remarks
 * 三级结构 **Tenant ⊃ Organization ⊃ Workspace** 不变；本枚举把「租内跨组织可见性」从上一轮 vision
 * 的**静态默认互见**升为**每租户可强制的策略维**：
 *  - `shared`（缺省）：同租内跨组织默认互见——与存量行为**逐字节等价**（零行为变更·expand 段安全垫）。
 *  - `isolated`：租内跨组织互不可见（防火墙/子公司隔离场景）——读路径经全局 filter 追加 `organizationId`
 *    收窄（见 `tenant-isolation-filter.ts` 切片 1）。
 *
 * **安全底线不动摇**：本策略只在**租内**收紧可见性，`tenantId` 仍是永不放松的跨租硬隔离地板；
 * `isolated` 绝不放松跨租 fail-closed，仅在已激活组织时于租内追加组织维过滤。
 *
 * 持久化落点 = `tenant.orgVisibility`（本租户根表列·值域由 `ORG_VISIBILITY` 单源经 DB CHECK 防线守护·
 * 沿 `TENANT_STATUS` 同构）；运行期经中间件解析链「顺带读回」注入 ALS 作用域供 filter 消费。
 *
 * @public
 */
export const ORG_VISIBILITY = {
  /** 同租内跨组织默认互见（存量语义·缺省值）。 */
  SHARED: 'shared',
  /** 租内跨组织互不可见（opt-in·激活全局 filter 组织收窄）。 */
  ISOLATED: 'isolated',
} as const;

/** 租内可见性策略的字面量联合（自 `ORG_VISIBILITY` 派生）。 @public */
export type OrgVisibility = (typeof ORG_VISIBILITY)[keyof typeof ORG_VISIBILITY];

/**
 * 是否租内组织隔离（全局 filter 的 org 收窄开关）。
 *
 * @param visibility - 待判定的可见性策略（可为 undefined·缺省非 isolated=shared 互见）
 * @returns 仅显式 `isolated` 时 `true`；否则 `false`
 * @public
 */
export function isOrgIsolated(visibility: OrgVisibility | string | undefined): boolean {
  return visibility === ORG_VISIBILITY.ISOLATED;
}

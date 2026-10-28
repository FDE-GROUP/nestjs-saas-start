/**
 * MCP 首批工具注册表（module-mcp-agent-surface §2.1-4·纯契约面静态表·零 SDK 依赖）。
 *
 * @remarks
 * 切片 2 的 `/mcp` server 壳据此映射 `tools/list`/`tools/call`；本表切片 1 先落**判据语义**：
 * 每工具声明所需 scope，授权集（凭证 scopes）不含即不可见/不可调——**空 scope 集 = 零可用
 * 工具**（deny-by-default·立项稿切片 1 四负例之二）。工具 handler 一律委托既有应用服务，
 * 本表不携带任何第二套判据逻辑（纯静态清单）。
 *
 * **首批降为只读两工具（切片 2 人裁乙·2026-10-28）**：`workspace.create` 写工具需「活动
 * 组织」（MikroWorkspaceRepository 每方法先调 `requireActiveOrganizationId()`），而 bearer 凭证
 * 只有租户轴、无会话组织——本表暂不收录该写工具（避免写入提权面），待专片设计
 * 「Agent 显式选 org + 租属校验」后再铺。本表只列**已实现且可安全对外声明**的工具。
 *
 * @public
 */
export const MCP_TOOLS = [
  { name: 'tenant.directory', requiredScope: 'read' },
  { name: 'posts.list', requiredScope: 'read' },
] as const;

/** 工具名联合（自静态表派生·单源）。 @public */
export type McpToolName = (typeof MCP_TOOLS)[number]['name'];

/**
 * 按凭证授权集筛选可用工具名：`granted` 不含工具所需 scope → 剔除；
 * 空授权集恒空结果（零可用工具·无例外）。
 *
 * @public
 */
export function selectToolNames(granted: readonly string[]): McpToolName[] {
  return MCP_TOOLS.filter((tool) => granted.includes(tool.requiredScope)).map((tool) => tool.name);
}

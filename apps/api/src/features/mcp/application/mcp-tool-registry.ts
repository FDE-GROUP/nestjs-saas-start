/**
 * MCP 首批工具注册表（module-mcp-agent-surface §2.1-4·纯契约面静态表·零 SDK 依赖）。
 *
 * @remarks
 * 切片 2 的 `/mcp` server 壳据此映射 `tools/list`/`tools/call`；本表切片 1 先落**判据语义**：
 * 每工具声明所需 scope，授权集（凭证 scopes）不含即不可见/不可调——**空 scope 集 = 零可用
 * 工具**（deny-by-default·立项稿切片 1 四负例之二）。工具 handler 一律委托既有应用服务，
 * 本表不携带任何第二套判据逻辑（纯静态清单）。
 *
 * **写工具 `workspace.create` 回归（切片 3 人裁甲·2026-10-28）**：切片 2 人裁乙曾将其
 * 剔离（写工具硬需「活动组织」而 bearer 只有租轴）。本切片补该轴：`organizationId` 作
 * **必填入参**（Agent 显式选组织·拒绝多组织租下静默代答），执行器先以凭证可见租目录
 * 校组 织归属（跨租/不存在同回执防枚举），再对称接 HTTP 面 `@Can('create','Workspace')` 裁决，
 * 最经嵌套 ALS 补 `organizationId` 轴后派既有 command——仓储双盖章/写闸零改。
 *
 * @public
 */
export const MCP_TOOLS = [
  { name: 'tenant.directory', requiredScope: 'read' },
  { name: 'posts.list', requiredScope: 'read' },
  { name: 'workspace.create', requiredScope: 'write' },
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

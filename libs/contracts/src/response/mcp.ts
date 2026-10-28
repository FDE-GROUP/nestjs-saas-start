import { z } from 'zod';

/**
 * MCP 凭证管理面响应契约（切片 1·真相源 = mcp credentials controller 返回类型·
 * apps 侧编译期双向赋值锁锚定；默认 strip 即白名单——token 哈希等持久层字段不得入列）。
 */

/**
 * 凭证列表行视图（**不含**任何可复原明文 token 的字段；`tokenPrefix` 仅供用户辨认）。
 *
 * @public
 */
export const mcpCredentialRowSchema = z.object({
  id: z.string(),
  /** 用户可读凭证名。 */
  name: z.string(),
  /** 授权面词汇（`read|write`）。 */
  scopes: z.array(z.string()),
  /** 明文 token 前缀（辨认用·非秘密）。 */
  tokenPrefix: z.string(),
  /** 过期时刻（策略钉定或用户选定）。 */
  expiresAt: z.instanceof(Date),
  /** 最近一次经凭证成功调用时刻（未用为 null）。 */
  lastUsedAt: z.instanceof(Date).nullable(),
  /** 撤销时刻（在用为 null）。 */
  revokedAt: z.instanceof(Date).nullable(),
  createdAt: z.instanceof(Date),
});
export type McpCredentialRow = z.infer<typeof mcpCredentialRowSchema>;

/**
 * mint 成功响应：行视图 + **一次性明文 token**（此后任何面不再回显，丢失即轮换）。
 *
 * @public
 */
export const mintedMcpCredentialSchema = mcpCredentialRowSchema.extend({
  /** 明文 token（仅此一次回显）。 */
  token: z.string(),
});
export type MintedMcpCredential = z.infer<typeof mintedMcpCredentialSchema>;

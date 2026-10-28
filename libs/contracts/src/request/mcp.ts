import { z } from 'zod';
import { reqString, reqStringMax } from '../helpers';
import { strictObject } from '../strict';

/**
 * MCP 凭证授权面词汇（初版粗粒度·`read`=只读 tools 面，`write`=受控写操作面）。
 *
 * @internal
 */
export const MCP_CREDENTIAL_SCOPES = ['read', 'write'] as const;

/**
 * 铸造 MCP 凭证入参（`POST /api/v1/mcp/credentials` 的 `@Body`）。
 *
 * @remarks
 * 承 plan [docs/plans/module-mcp-agent-surface.md](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/plans/module-mcp-agent-surface.md) 切片 1：
 * 凭证 = 用户对其会话的**有界委托**（scopes ⊆ 会话角色可达面，运行时交集收窄），
 * `expiresInDays` 可选（缺省由服务端策略钉定上界）；明文 token 仅 mint 响应一次性回显，
 * 存储侧只落哈希（对齐 `sso-token.service` 的 HMAC 无状态形态之外的持久凭证形态）。
 *
 * @public
 */
export const mintMcpCredentialSchema = strictObject({
  /** 凭证名（用户可读标识，列表/审计用）。 */
  name: reqStringMax('mcpCredentialName.required', 100),
  /** 授权面（非空 ⊆ `read|write` 词汇）。 */
  scopes: z.array(z.enum(MCP_CREDENTIAL_SCOPES)).min(1, { error: 'mcpScopes.required' }),
  /** 有效期天数（1–365；缺省由服务端策略钉定）。 */
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type MintMcpCredential = z.infer<typeof mintMcpCredentialSchema>;

/**
 * MCP 凭证 id 路径参（`DELETE /api/v1/mcp/credentials/:id` 的 `@Param`）。
 *
 * @public
 */
export const mcpCredentialIdParamSchema = strictObject({
  id: reqString('mcpCredentialId.required'),
});
export type McpCredentialIdParam = z.infer<typeof mcpCredentialIdParamSchema>;

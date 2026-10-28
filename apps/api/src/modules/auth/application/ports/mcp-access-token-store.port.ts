import type { McpAccessToken } from '../../infrastructure/entities/mcp-access-token.entity';

/**
 * `McpAccessTokenStore` 端口的 DI 注入 token。
 *
 * @public
 */
export const MCP_ACCESS_TOKEN_STORE = Symbol('MCP_ACCESS_TOKEN_STORE');

/**
 * mint 落库输入（明文不入本形——哈希在服务层完成后传入；`tenantId` 由实现侧 ALS 盖章，
 * 端口不暴露租户参数·沿 posts 仓储「隔离唯一 SSOT」同律）。
 *
 * @public
 */
export interface McpAccessTokenMintInput {
  userId: string;
  name: string;
  /** 明文 token 的 sha256 hex。 */
  tokenHash: string;
  /** 明文前缀（辨认用·非秘密）。 */
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date;
}

/**
 * MCP 租级凭证（`mcp_access_token`·auth 属主）的受控读写入口（module-mcp-agent-surface 切片 1）。
 *
 * @remarks
 * 实体归位裁定：凭证属 auth 身份机器族（与 consent/session 同族），**features/mcp 编排面经本端口
 * 落属主**（PIPL/AUTH_USER_STORE 同型先例），禁绕行直捅 entity。本端口居 `application/` 层——
 * features 深导入判据（verify-feature-isolation B 面）只红 `domain|infrastructure` 路径，
 * application 为上下文公开耦合面。
 * 消费面（哈希查找 `findByHash`/`touchLastUsed`）属切片 2 MCP 执行面，届时 additive 扩列。
 *
 * @public
 */
export interface McpAccessTokenStore {
  /**
   * 铸造凭证行：`tenantId` 由可信 ALS `requireActiveTenantId()` fail-closed 盖章（先于任何 DB 访问），
   * 拒 body/调用侧伪造。
   */
  create(input: McpAccessTokenMintInput): Promise<McpAccessToken>;
  /** 活动租户内「我的凭证」列表（`userId` 属主收窄·createdAt 降序·撤销行保留供辨认）。 */
  listByOwner(userId: string): Promise<McpAccessToken[]>;
  /**
   * 撤销（租内+属主双界 `revokedAt` 软位·重复 revoke 幂等成功）。
   * @returns 命中行数 0 → false（controller 面译 404）。
   */
  revoke(userId: string, id: string): Promise<boolean>;
}

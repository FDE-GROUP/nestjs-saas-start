/**
 * `McpTokenVerifier` 端口的 DI 注入 token（auth application 公开面·切片 1 校验中间件判据件）。
 *
 * @remarks
 * 实现驻 `features/mcp/application`（编排面），经 `McpModule` 以本 token 注册——属主侧
 * （modules/auth 的 gated e2e）经 token 消费，**零 features 路径 import**（隔离闸 A 面
 * 禁 modules 引 features，测试文件同律·沿「DB 集成测试落归属上下文」先例）。
 *
 * @public
 */
export const MCP_TOKEN_VERIFIER = Symbol('MCP_TOKEN_VERIFIER');

/**
 * 校验通过的凭证视图（租户/属主/权限均取自签发盖章行·调用侧零参数可注入）。
 *
 * @public
 */
export interface VerifiedMcpCredential {
  credentialId: string;
  /** 凭证=租户单源（签发时盖章·本视图不可被调用侧改写）。 */
  tenantId: string;
  userId: string;
  name: string;
  /** 授权 scope 清单（deny-by-default：空集 = 零可用工具）。 */
  scopes: readonly string[];
}

/**
 * MCP 租级服务凭证的消费面校验入口（bearer 明文 → 可信凭证视图）。
 *
 * @remarks
 * fail-closed 语义（立项稿 §2.3 deny-by-default）：不存在/已撤销/已过期**统一 401**
 * （同文案防探测）；租户被封禁（suspend/deleted/pending_approval）→ 403（失能联动
 * 沿 `TenantStatusService` 单源，不复用第二判据）。成功路径刷 `lastUsedAt`（窄写失败不阻断）。
 *
 * @public
 */
export interface McpTokenVerifier {
  /** bearer 明文（`mcp_` + hex，已剥 `Bearer ` 前缀的调用方负责传入纯 token）。 */
  verify(bearerToken: string): Promise<VerifiedMcpCredential>;
}

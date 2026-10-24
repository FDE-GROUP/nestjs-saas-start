import { z } from 'zod';

/**
 * SSO 身份提供方（OP）client 注册表条目（承 plan oauth-sso-odoo-integration 切片 B）。
 *
 * @remarks
 * 走 env/config 而非新增 BA 表——绕开「BA 表契约」红线语境（调研 §4）。`redirectUris` 为**精确白名单**
 * （逐字匹配·非前缀），`audience` 铸入 JWT `aud` 并在 userinfo 校验（补位 Odoo CE 无 audience 校验·风险 #4）。
 * @public
 */
export const ssoClientSchema = z.object({
  clientId: z.string().min(1),
  redirectUris: z.array(z.string().min(1)).min(1),
  audience: z.string().min(1),
});
export type SsoOauthClient = z.infer<typeof ssoClientSchema>;

/**
 * 解析 `SSO_OAUTH_CLIENTS`（JSON 数组）为 client 注册表。
 *
 * @remarks
 * - **未配 / 空 → 空数组**：fail-closed——无注册 client 时 authorize 端点一律拒（缺省不放行任何接入方）；
 * - **配置存在但非法 → fail-loud 抛错**：防拼写/结构错误静默退化成空注册表（镜像 seed fail-loud 纪律），
 *   使「配了却没生效」在 boot 期即暴露，而非到运行期才神秘 403。
 * 真值（含 client 白名单）由部署方经 `.env` 提供，仓库只给占位（AGENTS §2 禁 agent 写真实凭证）。
 *
 * @param raw - `process.env.SSO_OAUTH_CLIENTS` 原始串（可缺省）。
 * @returns 校验通过的 client 数组；未配为 `[]`。
 * @public
 */
export function parseSsoClients(raw: string | undefined): SsoOauthClient[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [];
  const parsed = z.array(ssoClientSchema).safeParse(JSON.parse(trimmed));
  if (!parsed.success) {
    throw new Error(
      'SSO_OAUTH_CLIENTS 非法：须为 [{ clientId, redirectUris: string[], audience }] JSON 数组',
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

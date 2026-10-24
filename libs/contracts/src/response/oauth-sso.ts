import { z } from 'zod';

/**
 * SSO userinfo 响应 claims（`GET /api/v1/auth/oauth2/userinfo`·Odoo `res_users._sanitized_oauth_payload` 消费面）。
 *
 * @remarks
 * 白名单面（默认 strip·未声明字段/PII 剥落不出线）：Odoo 侧按 `sub`/`id`/`user_id` 三选一取 subject，
 * 本案统一以 `sub`（平台 user id·稳定）承载；`email` 作 Odoo login 字段（须已验证·切片 D 硬门）；
 * `name` 供 Odoo 建号显示名。**跨系统仅传最小 PII**（风险登记 #8）。
 * 注意：端点须返**裸 JSON**（非本仓 api envelope），否则 Odoo `auth_oauth` 解析失败——归切片 D 实现处置。
 * 承 plan [docs/plans/oauth-sso-odoo-integration.md](../../../../docs/plans/oauth-sso-odoo-integration.md) 切片 A。
 *
 * @public
 */
export const userinfoResponseSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string(),
});
export type OauthUserInfo = z.infer<typeof userinfoResponseSchema>;

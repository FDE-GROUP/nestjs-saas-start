import { z } from 'zod';
import { reqString } from '../helpers';
import { strictObject } from '../strict';

/**
 * OAuth2 隐式流 authorize 允许下发的 scope 词表（超集即拒·对齐 Odoo `auth_oauth` 缺省 `openid profile email`）。
 *
 * @internal
 */
const SCOPE_ALLOWED = new Set(['openid', 'profile', 'email']);

/**
 * SSO authorize 入参（`GET /api/v1/auth/oauth2/authorize` 的 `@Query`·与 Odoo `auth_oauth` 隐式流协议形状对齐）。
 *
 * @remarks
 * wire 键取 OAuth2 标准 snake_case（`client_id`/`redirect_uri`/`response_type`/`scope`/`state`）——
 * 这些是 Odoo 20 CE `auth_oauth` 构造授权链接时按规范直发的查询串，非本仓内部命名可自选。
 * `response_type` 钉死字面量 `'token'`：CE `auth_oauth` **仅支持隐式流**（无 code flow/PKCE），
 * 传其它值即协议不符，须在传输层 fail-closed 拒入（风险登记 #1·调研 §2.1）。
 * `scope` 为空格分隔串，元素须 ⊆ `openid profile email`（越界拒）。
 * 承 plan [docs/plans/oauth-sso-odoo-integration.md](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/plans/oauth-sso-odoo-integration.md) 切片 A。
 *
 * @public
 */
export const authorizeQuerySchema = strictObject({
  client_id: reqString('validate.clientId.required'),
  redirect_uri: reqString('validate.redirectUri.required'),
  response_type: z.literal('token', { error: 'validate.responseType.unsupported' }),
  scope: z
    .string()
    .optional()
    .refine(
      (raw) =>
        raw === undefined ||
        raw
          .split(/\s+/)
          .filter(Boolean)
          .every((token) => SCOPE_ALLOWED.has(token)),
      { error: 'validate.scope.invalid' },
    ),
  state: z.string().optional(),
});
export type OauthAuthorizeQuery = z.infer<typeof authorizeQuerySchema>;

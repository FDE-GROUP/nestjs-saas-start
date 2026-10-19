/**
 * CORS origin 白名单解析（module-common-cors-whitelist）。
 *
 * 缘起：三份 env（default/development/production）曾硬编码 `origin:'*'` + `credentials:true`，
 * 违反 CORS 凭证语义且同喂 Better Auth `trustedOrigins='*'`。改由环境变量 `ALLOWED_ORIGINS`
 * （逗号分隔的**完整 origin**，含 scheme，如 `http://localhost:5173`）驱动单一白名单源。
 *
 * 语义：切分 / trim / 去空；有效项为空时回落 `fallback`（缺省 `[]`=生产 fail-closed，拒所有跨源，
 * 同源请求无 Origin 头不受影响）。
 */
export function parseCorsOrigins(
  raw: string | undefined | null,
  fallback: readonly string[] = [],
): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [...fallback];
}

/**
 * 登录后回跳的开放重定向防护（deep-link return）。
 * 仅接受「站内相对路径」：单个 `/` 开头、非协议相对 `//`、不含反斜杠变体（部分浏览器会将其归一为 `//host`）。
 * 非法/缺失一律返回 `null`（调用方回落首页）。
 */
export function safeInternalPath(next: string | undefined): string | null {
  if (typeof next !== 'string' || next.length === 0) return null;
  if (!next.startsWith('/')) return null; // 必须是站内绝对路径（排除 http:、javascript:、mailto: 等）
  if (next.startsWith('//')) return null; // 协议相对 //host → 外链
  if (next.includes('\\')) return null; // 反斜杠归一化风险
  return next;
}

/**
 * Better Auth 原生 HTTP 门面（同源相对路径·经 dev 反代至 :7009）。
 * 会话语义与后端一致：Cookie + DB Session（tooling §4.12），前端不自造 token 存取。
 * email+password 仅非生产启用（既有裁点）。
 */
const BASE = '/api/v1/auth';

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
}

export interface SessionResult {
  user: SessionUser;
  session: { id: string; expiresAt: string; activeOrganizationId?: string };
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * 会话读取的错误分类（区分「不可用」与「未登录」，实机存照：无 cookie 回 401；登出后回 200 + body null）：
 * - 401/403/登出 200-null → 返回 null（确属无有效会话，由 requireSession 弹回登录）。
 * - 5xx（含 dev 反代对宕机后端的 502 代答）/ 网络异常 → 抛出：非「无会话」，穿透 loader 使
 *   受保护页落到路由错误边界（RouteError），不再被误弹到必然失败的登录页。
 */
export async function getSession(): Promise<SessionResult | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/get-session`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('会话服务不可用（网络异常）');
  }
  if (res.status >= 500) throw new Error(`会话服务不可用（${res.status}）`);
  if (!res.ok) return null;
  return ((await res.json()) ?? null) as SessionResult | null;
}

/** 登录/注册/魔法链接面失败文案：5xx 归一为「服务暂时不可用」，否则取后端 message 或带状态码的兜底。 */
async function authFailure(res: Response, fallback: string): Promise<string> {
  if (res.status >= 500) return '服务暂时不可用，请稍后重试';
  const detail = (await res.json().catch(() => ({}))) as { message?: string };
  return detail.message ?? `${fallback}（${res.status}）`;
}

export interface SignInOutcome {
  ok: boolean;
  status: number;
  error?: string;
}

export async function signInEmail(email: string, password: string): Promise<SignInOutcome> {
  const res = await post('/sign-in/email', { email, password });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: await authFailure(res, '登录失败') };
}

/** 注册（dev only·NODE_ENV !== 'production' 时后端 emailAndPassword.enabled）。 */
export async function signUpEmail(
  email: string,
  password: string,
  name: string,
): Promise<SignInOutcome> {
  const res = await post('/sign-up/email', { email, password, name });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: await authFailure(res, '注册失败') };
}

export async function signOut(): Promise<void> {
  await post('/sign-out', {});
}

/**
 * 魔法链接登录（module-auth-magic-link·仅非生产后端挂载）：向 `email` 发一次性登录邮件，
 * 用户点链接后由 BA `/magic-link/verify` 落会话并 `redirect` 到 `callbackURL`（前端落地页·
 * 承 dashboard 落租/onboarding loader）。此处只发起请求，返回是否已投递（非登录成功）。
 */
export async function signInMagicLink(email: string, callbackURL: string): Promise<SignInOutcome> {
  const res = await post('/sign-in/magic-link', { email, callbackURL });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: await authFailure(res, '邮件发送失败') };
}

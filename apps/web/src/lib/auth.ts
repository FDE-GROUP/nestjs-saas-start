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

/** 无有效会话一律收敛为 null（实机存照：无 cookie 回 401；登出后回 200 + body null）。 */
export async function getSession(): Promise<SessionResult | null> {
  const res = await fetch(`${BASE}/get-session`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as SessionResult;
}

export interface SignInOutcome {
  ok: boolean;
  status: number;
  error?: string;
}

export async function signInEmail(email: string, password: string): Promise<SignInOutcome> {
  const res = await post('/sign-in/email', { email, password });
  if (res.ok) return { ok: true, status: res.status };
  const detail = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: false, status: res.status, error: detail.message ?? `登录失败（${res.status}）` };
}

/** 注册（dev only·NODE_ENV !== 'production' 时后端 emailAndPassword.enabled）。 */
export async function signUpEmail(
  email: string,
  password: string,
  name: string,
): Promise<SignInOutcome> {
  const res = await post('/sign-up/email', { email, password, name });
  if (res.ok) return { ok: true, status: res.status };
  const detail = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: false, status: res.status, error: detail.message ?? `注册失败（${res.status}）` };
}

export async function signOut(): Promise<void> {
  await post('/sign-out', {});
}

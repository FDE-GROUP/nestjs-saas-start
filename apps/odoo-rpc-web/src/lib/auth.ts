const BASE = '/api/v1/auth';

/**
 * Better Auth 会话面（自 apps/web 同构裁剪·切片 C）：sign-in/email + get-session +
 * sign-out。email+password 仅非生产启用（既有裁点）。/odoo/** 数据面不在此——见 lib/odoo.ts。
 */

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
}

export interface SessionResult {
  user: SessionUser;
  session: { id: string; expiresAt: string; activeOrganizationId?: string };
}

/**
 * 会话读取的错误分类（与 apps/web 同裁）：401/登出 200-null → null（确属无会话）；
 * 5xx/网络异常 → 抛（非「无会话」，勿把服务抖动误弹成登录页）。
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

export interface SignInOutcome {
  ok: boolean;
  status: number;
  error?: string;
}

export async function signInEmail(email: string, password: string): Promise<SignInOutcome> {
  const res = await fetch(`${BASE}/sign-in/email`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) return { ok: true, status: res.status };
  if (res.status >= 500)
    return { ok: false, status: res.status, error: '服务暂时不可用，请稍后重试' };
  const detail = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: false, status: res.status, error: detail.message ?? `登录失败（${res.status}）` };
}

export async function signOut(): Promise<void> {
  await fetch(`${BASE}/sign-out`, { method: 'POST', credentials: 'same-origin' }).catch(
    () => undefined,
  );
}

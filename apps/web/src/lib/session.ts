import { redirect } from '@tanstack/react-router';
import { getSession, type SessionResult } from './auth';
import { safeInternalPath } from './safe-redirect';

/**
 * 受保护页的统一会话守卫（deny-by-default 的前端映射·与后端会话墙同向）。
 * 无有效会话 → 弹回登录页；各自助面 loader 首行调用，再取 typed 数据。
 *
 * 传入 `attempted`（__root.beforeLoad 的导航目标 location）时，重定向携带 `?next=<原路径含查询>`，
 * 供登录成功后深链回跳；loader 内直接调用（无参）行为不变（仅弹回 /login）。
 */
export async function requireSession(attempted?: {
  pathname: string;
  searchStr: string;
}): Promise<SessionResult> {
  const session = await getSession();
  if (!session) {
    const target = attempted ? attempted.pathname + attempted.searchStr : undefined;
    throw redirect({ to: '/login', search: target ? { next: target } : {} });
  }
  return session;
}

/**
 * 反向守卫（已登录访问 /login·/register）：与 requireSession 同源走可 mock 的 getSession 接缝。
 * 已登录 → 弹离：有合法站内 `next` 回原目标（`safeInternalPath` 白名单），否则回落首页。
 * 严格判 `session?.user`（空体 `{}` 不算已登录）；`getSession` 抛错（5xx/网络）按 anon 放行表单——
 * 会话面抖动不应挡住登录入口。
 */
export async function redirectIfAuthenticated(next?: string): Promise<void> {
  let session: SessionResult | null;
  try {
    session = await getSession();
  } catch {
    return;
  }
  if (session?.user) {
    const target = safeInternalPath(next);
    if (target) throw redirect({ href: target });
    throw redirect({ to: '/' });
  }
}

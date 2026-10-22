import { redirect } from '@tanstack/react-router';
import { getSession, type SessionResult } from './auth';

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

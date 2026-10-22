import { useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getSession, type SessionResult } from './auth';

export type SessionStatus = 'loading' | 'authed' | 'anon';

export interface UseSessionResult {
  status: SessionStatus;
  user: SessionResult['user'] | null;
}

/**
 * 壳层（`__root` 导航）会话感知 hook：挂载时读会话，并在路由 `pathname` 变化后重取——
 * 登录 `navigate('/')` / 登出 `navigate('/login')` 即触发导航展开/收口，无需手动刷新。
 *
 * 与页面级数据失败解耦：`getSession()` 在 5xx/网络异常会抛（见 `lib/auth` 契约），此处归一为
 * `anon`（降级不崩壳层）；各受保护页的数据失败仍由其 loader 落到 `RouteError`。
 */
export function useSession(): UseSessionResult {
  const { pathname } = useLocation();
  const [session, setSession] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname 是有意的重取触发器（登录 navigate('/')/登出 navigate('/login') 后刷新会话），非 body 读取项，删依赖即废响应式。
  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch(() => {
        // 会话服务不可用：按未登录呈现导航（降级不崩）
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (loading) return { status: 'loading', user: null };
  return session ? { status: 'authed', user: session.user } : { status: 'anon', user: null };
}

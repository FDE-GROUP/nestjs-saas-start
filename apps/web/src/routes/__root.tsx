import { createRootRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { RouteError, RouteNotFound } from '../components/route-feedback';
import { ThemeToggle } from '../components/theme-toggle';
import { signOut } from '../lib/auth';
import { useSession } from '../lib/use-session';

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function RootLayout() {
  const { status, user } = useSession();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  // 导航按登录态收口：仅 `authed` 展开控制台链接；`loading`/`anon` 一律只显登录入口（避免闪现受守卫链接）。
  const authed = status === 'authed';

  // 全局登出（镜像 dashboard 既有范式）：signOut 后弹回登录页，useSession 随 pathname 变化即时收口导航。
  async function onSignOut() {
    setPending(true);
    try {
      await signOut();
      await navigate({ to: '/login' });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-white p-6 font-sans text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <header className="mb-8 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            SaaS Console
          </Link>
          {authed ? (
            <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
              <Link to="/workspaces" className="hover:text-slate-900 dark:hover:text-white">
                Workspaces
              </Link>
              <Link to="/posts" className="hover:text-slate-900 dark:hover:text-white">
                文章
              </Link>
              <Link to="/settings/members" className="hover:text-slate-900 dark:hover:text-white">
                成员
              </Link>
              <Link to="/settings/roles" className="hover:text-slate-900 dark:hover:text-white">
                角色权限
              </Link>
              <Link
                to="/settings/invitations"
                className="hover:text-slate-900 dark:hover:text-white"
              >
                邀请管理
              </Link>
              <Link to="/invitations" className="hover:text-slate-900 dark:hover:text-white">
                我的邀请
              </Link>
              <Link to="/settings/account" className="hover:text-slate-900 dark:hover:text-white">
                账号
              </Link>
              <Link to="/settings/billing" className="hover:text-slate-900 dark:hover:text-white">
                订阅计费
              </Link>
              <Link
                to="/platform/tenants"
                search={{ offset: 0 }}
                className="hover:text-slate-900 dark:hover:text-white"
              >
                平台运营
              </Link>
            </nav>
          ) : (
            <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
              <Link to="/login" className="hover:text-slate-900 dark:hover:text-white">
                登录
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          {authed && user && (
            <>
              <span className="max-w-[16rem] truncate text-xs text-slate-500 dark:text-slate-400">
                {user.email}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                disabled={pending}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {pending ? '登出中…' : '登出'}
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

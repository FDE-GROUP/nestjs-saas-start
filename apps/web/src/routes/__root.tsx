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

// 导航链基类（非命中）与命中态：activeProps.className 命中时整体覆盖基类，故两组均自含布局类。
const NAV_BASE =
  'rounded px-1.5 py-0.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white';
const NAV_ACTIVE =
  'rounded px-1.5 py-0.5 bg-slate-100 font-semibold text-slate-900 hover:text-slate-900 dark:bg-slate-800 dark:text-white dark:hover:text-white';

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
              <Link
                to="/workspaces"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                Workspaces
              </Link>
              <Link
                to="/posts"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                文章
              </Link>
              <Link
                to="/settings/members"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                成员
              </Link>
              <Link
                to="/settings/roles"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                角色权限
              </Link>
              <Link
                to="/settings/invitations"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                邀请管理
              </Link>
              <Link
                to="/invitations"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                我的邀请
              </Link>
              <Link
                to="/settings/account"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                账号
              </Link>
              <Link
                to="/settings/billing"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                订阅计费
              </Link>
              <Link
                to="/platform/tenants"
                search={{ offset: 0 }}
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
                平台运营
              </Link>
            </nav>
          ) : (
            <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
              <Link
                to="/login"
                className={NAV_BASE}
                activeProps={{ 'aria-current': 'page', className: NAV_ACTIVE }}
              >
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

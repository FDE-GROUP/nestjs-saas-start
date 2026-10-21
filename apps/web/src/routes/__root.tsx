import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { RouteError, RouteNotFound } from '../components/route-feedback';

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function RootLayout() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl p-6 font-sans text-slate-800">
      <header className="mb-8 flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            SaaS Console
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            <Link to="/workspaces" className="hover:text-slate-900">
              Workspaces
            </Link>
            <Link to="/posts" className="hover:text-slate-900">
              文章
            </Link>
            <Link to="/settings/members" className="hover:text-slate-900">
              成员
            </Link>
            <Link to="/settings/roles" className="hover:text-slate-900">
              角色权限
            </Link>
            <Link to="/settings/invitations" className="hover:text-slate-900">
              邀请管理
            </Link>
            <Link to="/invitations" className="hover:text-slate-900">
              我的邀请
            </Link>
            <Link to="/settings/account" className="hover:text-slate-900">
              账号
            </Link>
            <Link to="/settings/billing" className="hover:text-slate-900">
              订阅计费
            </Link>
            <Link to="/platform/tenants" search={{ offset: 0 }} className="hover:text-slate-900">
              平台运营
            </Link>
          </nav>
        </div>
        <span className="text-xs text-slate-400">F2 自助面 · apps/web</span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { requireSession } from '../lib/session';

/**
 * 平台运营段外壳（前端 F4a · module-frontend-platform §2.2·裁⑦甲）。
 * 独立受众边界：内部导航 + Outlet；deny-by-default 由父 loader `requireSession` 把关
 * （运营者身份的最终裁判是各页 loader 命中的后端 `PlatformOperatorGuard` 403·裁②甲）。
 * F4b（用户治理）落地时在此加「用户治理」链接。
 */
export const Route = createFileRoute('/platform')({
  loader: async () => {
    await requireSession();
    return null;
  },
  component: PlatformShell,
});

function PlatformShell() {
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-4 border-b border-slate-200 pb-2 text-sm dark:border-slate-700">
        <span className="font-semibold text-slate-800 dark:text-slate-100">平台运营</span>
        <Link
          to="/platform/tenants"
          search={{ offset: 0 }}
          className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          组织治理
        </Link>
        <Link
          to="/platform/users"
          search={{ offset: 0 }}
          className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          用户治理
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

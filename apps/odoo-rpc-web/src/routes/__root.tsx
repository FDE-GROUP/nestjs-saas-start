import { createRootRoute, Outlet } from '@tanstack/react-router';

/**
 * 根路由壳（切片 C 演示壳·自 apps/web 同构裁剪）：html 骨架 + 顶栏 + Outlet。
 * 会话导航守卫不做在根（演示面小），逐页 loader 见 routes/index.tsx。
 */
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">
          Odoo RPC 演示{' '}
          <span className="text-sm font-normal text-gray-500">
            经 SaaS 服务端只读访问 Odoo 数据
          </span>
        </h1>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

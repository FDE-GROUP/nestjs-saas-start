import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { RouteError, RoutePending } from './components/route-feedback';
import { ThemeProvider } from './lib/theme-provider';
// 文件式路由生成物（@tanstack/router-plugin 在 dev/build 时重写·提交入库保 tsc 可过）。
import { routeTree } from './routeTree.gen';

// demo 镜像将 apps/web 挂同源子路径时（切片 G）vite base=WEB_BASE（如 `/app/`）；
// router basepath 需与 base 同源同值（去尾斜杠）：`/app/`→`/app`，dev 默认 `/`→''→undefined。
const BASEPATH = import.meta.env.BASE_URL.replace(/\/+$/, '');

const router = createRouter({
  routeTree,
  basepath: BASEPATH || undefined,
  defaultPreload: 'intent',
  // 路由健壮性收口：子路由未自设 error/pending 时的全局兜底（与根路由共用同一纯件）。
  defaultErrorComponent: RouteError,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 200,
  defaultPendingMinMs: 300,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);

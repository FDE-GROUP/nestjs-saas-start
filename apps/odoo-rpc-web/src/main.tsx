import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
// 文件式路由生成物（@tanstack/router-plugin 在 dev/build 时重写·提交入库保 typecheck 可过）。
import { routeTree } from './routeTree.gen';

// demo 镜像将本项目挂同源子路径时（切片 D）vite base=ODOO_WEB_BASE（如 `/odoo-rpc/`）；
// router basepath 需与 base 同源同值（去尾斜杠）：`/odoo-rpc/`→`/odoo-rpc`，dev 默认 `/`→''→undefined。
const BASEPATH = import.meta.env.BASE_URL.replace(/\/+$/, '');

const router = createRouter({
  routeTree,
  basepath: BASEPATH || undefined,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

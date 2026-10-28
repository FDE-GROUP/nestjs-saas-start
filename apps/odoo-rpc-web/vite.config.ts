import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 同源反代（tooling §4.12 同构）：前端只写相对路径，/api/*（含 Better Auth 面与
// /api/v1/odoo/** feature 端点）经 dev proxy 转至本地 Nest API——端口由 WEB_PROXY_TARGET
// 覆盖（私有机器 demo 联调常用 7010 避开 demo 镜像容器的 :7009 占用），默认 :7009。
//
// base：demo 镜像将本项目挂到同源子路径 `/odoo-rpc/`（切片 D）时由构建环境变量 ODOO_WEB_BASE
// 驱动（与 apps/web 切片 G 同构）；dev / 根路径部署默认 `/`（不受影响）。需与 main.tsx 的 router basepath 同源同值。
//
// 契约单源（feature 契约例外·tooling §3）：`@odoo-feature` 直指 **apps/api feature 侧源件** 的
// schema 文件（非公共 contracts 包）——前后端同一文件、零复制漂移；该文件只 import zod，
// 前端可安全消费（不触 @core/装饰器面）。
export default defineConfig({
  base: process.env.ODOO_WEB_BASE ?? '/',
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@odoo-feature',
        replacement: path.resolve(
          import.meta.dirname,
          '../api/src/features/odoo-rpc-api/api/odoo-rpc.schemas.ts',
        ),
      },
      // schema 源件在 apps/api/src/features（与本 app 分属不同 workspace 包），裸 `import 'zod'`
      // 会解析到 api 侧依赖；显式钉到本 app node_modules（保单一 zod 实例·避免双份 zod 类型/运行时分裂）。
      // 用 find/replacement + exact 匹配，避免 `starting` 语义误伤 'zod/…** 子路径导入。
      {
        find: /^zod$/,
        replacement: path.resolve(import.meta.dirname, 'node_modules/zod'),
      },
    ],
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.WEB_PROXY_TARGET ?? 'http://localhost:7009',
        changeOrigin: true,
      },
    },
  },
});

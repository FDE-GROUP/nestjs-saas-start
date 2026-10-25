import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 同源反代（tooling §4.12）：前端只写相对路径，/api/*（含 /api/v1/auth/*·Better Auth 面）
// 一律经 dev proxy 转至后端 :7009，免 CORS。生产部署面（静态服务/同域反代）另片裁定。
// base：demo 镜像将 apps/web 挂到同源子路径 `/app/`（切片 G）时由构建环境变量 WEB_BASE 驱动；
// dev / 根路径部署默认 `/`（不受影响）。需与 main.tsx 的 router basepath 同源同值。
export default defineConfig({
  base: process.env.WEB_BASE ?? '/',
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.WEB_PROXY_TARGET ?? 'http://localhost:7009',
        changeOrigin: true,
      },
    },
  },
});

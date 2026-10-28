# odoo-rpc 演示前端

展示「通过 SaaS 服务端只读访问 Odoo 数据」的集成能力切片（方案：
`docs/plans/module-odoo-rpc-frontend.md` 切片 C）。随开源边界重划（2026-10-28）并入
本公共仓 workspace（`apps/odoo-rpc-web`），是一个**可选的集成演示壳**——不入核心门禁、
opt-in 运行。

## 技术栈

与 `apps/web` 同栈：React 19 + Vite 8 + TanStack Router + Tailwind 4 + zod 4
（共用仓库根 pnpm workspace 与根 lockfile·版本随 apps/web 一致，无独立 lockfile）。

## 本地运行

前置：demo Odoo 实例可达（如 all-in-one 演示容器 `:8069`）+ 本地 Nest API 启动并注入
`ODOO_*` 四键（feature 已常驻本仓、随 git 追踪、无需同步，见 `apps/api/src/features/`）：

```bash
# 仓库根（nestjs-saas-start/）
pnpm install
ODOO_BASE_URL=http://127.0.0.1:8069 ODOO_DB=odoo-demo \
ODOO_LOGIN=saas_rpc_ro ODOO_API_KEY=<本机 demo key> \
PORT=7010 pnpm run start:dev        # demo 容器占 :7009 时用 7010 避让

# 本目录（等价：仓库根 `pnpm --filter odoo-rpc-web dev`）
WEB_PROXY_TARGET=http://localhost:7010 pnpm dev   # :5174
```

登录：公共仓 dev seed 账号（`admin@example.com` / `admin123`）。
Odoo 服务账号与 API key 的签发见 demo 镜像 runbook（不落仓、不含真实凭证）。

## 契约单源

数据面类型经 vite alias `@odoo-feature` **直指**
`apps/api/src/features/odoo-rpc-api/api/odoo-rpc.schemas.ts`（feature 叠加层契约例外·
tooling §3：契约随源码居 feature 侧、controller 退出公共 `openapi.yaml` 对拍）——
前后端同一 zod 文件，零复制。

# odoo-rpc 演示前端（私有叠加层）

展示「通过 SaaS 服务端只读访问 Odoo 数据」的集成能力切片（方案：
`docs/plans/module-odoo-rpc-frontend.md` 切片 C）。**本目录住私有仓**，不入公共仓
workspace、不进公共 CI/门禁（opt-in·严格叠加）。

## 技术栈

与 `apps/web` 同栈：React 19 + Vite 8 + TanStack Router + Tailwind 4 + zod 4
（独立 lockfile·版本与 apps/web 人工对齐——漂移风险已在方案 §4 登记）。

## 本地运行（私有机器）

前置：demo Odoo 实例可达（如 all-in-one 演示容器 `:8069`）+ 本地 Nest API 以
**在场态**（`pnpm run sync:features` 已同步）并注入 `ODOO_*` 四键启动：

```bash
# 仓库根（nestjs-saas-start/）
pnpm run sync:features
ODOO_BASE_URL=http://127.0.0.1:8069 ODOO_DB=odoo-demo \
ODOO_LOGIN=saas_rpc_ro ODOO_API_KEY=<本机 demo key> \
PORT=7010 pnpm run start:dev        # demo 容器占 :7009 时用 7010 避让

# 本目录
pnpm install
WEB_PROXY_TARGET=http://localhost:7010 pnpm dev   # :5174
```

登录：公共仓 dev seed 账号（`admin@example.com` / `admin123`）。
Odoo 服务账号与 API key 的签发见 demo 镜像 runbook（不落仓）。

## 契约单源

数据面类型经 vite alias `@odoo-feature` **直指** `server/features/odoo-rpc-api/api/odoo-rpc.schemas.ts`
（私有叠加层契约例外·tooling §3）——前后端同一 zod 文件，零复制。

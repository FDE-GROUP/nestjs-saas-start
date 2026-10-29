---
kind: build_system
name: pnpm workspace + NestJS SWC 构建与 CI/容器编排体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - Dockerfile
    - docker-compose.yml
    - nest-cli.json
    - tsconfig.build.json
    - .github/workflows/deploy-swagger.yml
    - .github/workflows/publish-demo-image.yml
    - scripts/ci.ts
    - scripts/ci-fullstack.ts
    - vitest.config.ts
    - playwright.config.ts
    - commitlint.config.cjs
---

## 1. 构建系统总览

仓库采用 **pnpm workspaces**（`package.json` `workspaces: ["apps/*", "libs/*"]`，`pnpm-workspace.yaml` 扩展至 `packages/*`）作为多包聚合根。Node 版本锁定为 `>=22.0.0`，包管理器锁定为 `pnpm@11.7.0`（通过 `packageManager` 字段 + Dockerfile 中 `corepack enable` 保证复现）。

- **NestJS API**：`nest-cli.json` 指定 `builder: "swc"`、`typeCheck: true`，输出到 `dist/apps/api/src/**`；编译产物由 `tsconfig.build.json` 控制路径映射（`@app/*`、`@modules/*`、`@config/*`、`@common/*`、`@shared/*`），并排除 `libs/`、`apps/web`、`apps/odoo-rpc-web`。
- **共享库**：`build:libs` 脚本按顺序对 `libs/core`、`libs/contracts`、`libs/api-contract`、`libs/ba-mikro-adapter` 分别执行 `nest build --builder swc` 后再 `tsc --emitDeclarationOnly` 产出 `.d.ts`。
- **前端应用**：`apps/web` 与 `apps/odoo-rpc-web` 各自独立 Vite 构建，通过 `pnpm --filter <pkg>` 调用。
- **API 客户端**：`packages/api-client` 单独 `build` 脚本生成 typed HTTP 客户端。
- **统一入口**：`pnpm run build` = `build:libs && build:client && build:nest`；`start` / `start:dev` / `start:debug` 均先 `build:libs` 再启动 Nest。

## 2. 测试体系

- **单元测试**：Vitest（`vitest.config.ts`），使用 `unplugin-swc` 支持装饰器 + `emitDecoratorMetadata`（Nest DI 必需），默认 `environment: 'node'`，包含 `apps/**/*.test.(ts|tsx)`、`libs/**/*.test.ts`、`packages/**/*.test.ts`、`scripts/**/*.test.ts`。
- **浏览器 E2E**：Playwright（`playwright.config.ts`），串行运行 `e2e/*.spec.ts`，baseURL 由 `E2E_BASE_URL` 注入（默认 `http://localhost:5173`），由 `scripts/e2e-web.ts` 编排 Testcontainers PG + seed + 编译产物 API :7009 + vite dev proxy。
- **全栈集成测试**：`scripts/ci-fullstack.ts` 用 `@testcontainers/postgresql` 拉起一次性 PG 容器（`postgres:16-alpine`），创建两库（`ci_e2e` + `mikro_ba_consistency`），回放已提交基线迁移后跑 `GATED_E2E_FILES` 清单中的 e2e 用例及 BA authFlow 一致性套件。清单与实存文件双向恒等校验（防漏登/漂移）。
- **覆盖率**：V8 provider，报告落 `./coverage`，排除 DTO/interfaces/main/seed/module 文件。

## 3. 质量门禁（本地 CI 编排器）

`scripts/ci.ts` 是本地/远程统一的门禁编排器，两种模式：

- **full**（默认 `pnpm run ci`）：check → type-escape ratchet → domain layout guard → feature isolation guard → stories drift guard → i18n key parity guard → overturned rulings guard → config contract guard → build → web/odoo-rpc-web typecheck → test-types → oRPC contract 对拍 → tenant-scoped registry guard → vitest → fallow architecture advisory。
- **quick**（`pnpm run ci:quick`）：仅 check + 全部纯文本静态闸 + vitest，跳过 build/fallow。

所有 verify-* 脚本均为 Node/TS 实现，无外部运行时依赖，失败即 exit code ≠ 0。

## 4. Git Hooks & 提交规范

- **Husky**：`.husky/pre-commit`、`.husky/pre-push`、`.husky/commit-msg`。
- **Commitlint**：`commitlint.config.cjs` 继承 `@commitlint/config-conventional`，限定 type 枚举（build/chore/ci/docs/feat/fix/perf/refactor/revert/style/test），subject/body/footer 行宽 100，禁止句点结尾、强制小写 type。

## 5. 容器化与编排

- **Dockerfile**（多阶段）：
  - `base`：`docker.m.daocloud.io/library/node:22-slim`（可覆盖 `NODE_IMAGE`），启用 corepack 并按 `packageManager` 拉 pnpm，`COREPACK_NPM_REGISTRY=https://registry.npmmirror.com`。
  - `dependencies`：只拷 `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `.npmrc` + 子包 package.json，`pnpm install --frozen-lockfile`，store 挂载缓存。
  - `builder`：`COPY . .` 后 `pnpm run build`。
  - `runner`：仅复制 `node_modules`、`dist`、`libs/core/dist`、必要的 `package.json` 与 `pnpm-workspace.yaml`（保证 workspace 符号链接与 exports 解析），暴露 7009，HEALTHCHECK 用内置 `fetch('http://127.0.0.1:7009/api/v1/health')`，CMD `node dist/apps/api/src/main.js`。
- **docker-compose.yml**：定义 `app`（端口 7009，依赖 `postgres`）+ `postgres:16-alpine`，策略键（`DATA_RESIDENCY_ENFORCE=true`、`DATA_RESIDENCY_DB_HOST_ALLOWLIST=postgres`、JWT_SECRET/JWT_REFRESH_SECRET/ALLOWED_ORIGINS/STORAGE_*）以 `?` 语法强制存在，避免 `.env` 静默补缺。
- **demo 镜像发布**：`.github/workflows/publish-demo-image.yml`（当前未提交，仅供审阅），手动触发 `workflow_dispatch`，推送 `arligle/odoocn-saas-start:<tag>` + `alpha` 双标签。

## 6. GitHub Actions

- **deploy-swagger.yml**：监听 `main` 分支上 `apps/**`、`libs/**`、`openapi/**`、`typedoc.json`、`tsconfig*.json`、`package.json`、`pnpm-lock.yaml` 变更，构建 Swagger UI + TypeDoc 文档站点，部署到 GitHub Pages（`peaceiris/actions-gh-pages@v4`）。
- **publish-demo-image.yml**：未提交的 demo 镜像发布流水线，需自备 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets。

## 7. 关键约定与约束

- **包管理器锁定**：`pnpm-workspace.yaml` 的 `allowBuilds` 白名单仅放行 `@swc/core`、`esbuild`，显式拒绝 `@scarf/scarf`、`cpu-features`、`protobufjs`、`ssh2`；`minimumReleaseAgeExclude` 仅豁免 TanStack Router 系列。
- **构建产物路径**：Nest 输出到 `dist/apps/api/src/**`（非默认 `dist/apps/api/**`），由 `tsconfig.build.json` 的 paths 与 nest-cli 共同决定。
- **环境变量治理**：生产部署必须通过 compose `environment:` 显式声明策略键（带 `?` 必填校验），`.env` 仅用于开发期补缺——compose 注释明确说明“文件再也覆不动它们”。
- **容器监听地址**：Dockerfile 默认 `ENV HOST=0.0.0.0`，与宿主开发 `.env` 的 `HOST=localhost` 分离，避免容器内回环不可达。
- **迁移纪律**：全栈测试与 `db:setup` 均走 `mikro-migrate.ts` 回放已提交基线迁移，不使用 `schema.create/synchronize`。
- **E2E 门控**：`GATED_E2E_FILES` 清单与实存 `.e2e.test.ts` 双向恒等校验，新增 gated 用例必须登记，否则 fail-loud。
- **CI 门禁分层**：纯文本静态闸（type-escape/domain-layout/stories/i18n/config/overturned-rulings/tenant-scoped-registry）在 quick/full 均跑；build/typecheck/oRPC 契约对拍仅在 full；fallow 架构边界仅作 advisory 不阻断。
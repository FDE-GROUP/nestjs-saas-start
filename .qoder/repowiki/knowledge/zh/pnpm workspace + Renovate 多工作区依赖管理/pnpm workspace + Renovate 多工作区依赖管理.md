---
kind: dependency_management
name: pnpm workspace + Renovate 多工作区依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - .npmrc
    - renovate.json
    - apps/api/package.json
    - libs/core/package.json
    - packages/api-client/package.json
---

## 1. 使用的系统/方案

仓库采用 **pnpm 11** 作为包管理器，配合 **pnpm workspace** 组织多工作区（apps、libs、packages），并通过 **Renovate** 在 GitHub Actions 上按周自动升级依赖。构建工具链使用 SWC（`@swc/core`、`unplugin-swc`）与 Nest CLI `--builder swc`。

- 包管理器锁定：根目录 `pnpm-lock.yaml` 为唯一版本锁定文件；根 `package.json` 通过 `"packageManager": "pnpm@11.7.0"` 强制 pnpm 版本。
- Node 引擎约束：`"engines": { "node": ">=22.0.0" }`。
- 私有 npm registry：`.npmrc` 将默认源设为 `https://registry.npmmirror.com`（国内镜像），并允许以 `pnpm install --registry=https://registry.npmjs.org` 覆盖。
- 无 vendored 第三方源码；所有第三方依赖均从 npm 拉取。

## 2. 关键文件

- `package.json` — 根工作区声明、脚本入口、顶层依赖清单（NestJS、Fastify、MikroORM、oRPC、Stripe、Better Auth、AWS SDK、AliOSS、COS 等）。
- `pnpm-workspace.yaml` — 工作区成员 `apps/*`、`libs/*`、`packages/*`，以及 `allowBuilds` 白名单与 `minimumReleaseAgeExclude`。
- `pnpm-lock.yaml` — 全仓依赖解析快照。
- `.npmrc` — npm registry 指向 npmmirror。
- `renovate.json` — Renovate 自动化升级策略。
- 子包 `apps/api/package.json`、`libs/core/package.json`、`packages/api-client/package.json` 等——各工作区包的依赖声明。

## 3. 架构与约定

### 3.1 工作区划分

| 路径 | 角色 | 说明 |
|---|---|---|
| `apps/*` | 应用（api、web、odoo-rpc-web） | 运行时应用，仅声明少量直接依赖（如 `apps/api` 只声明 `@casl/ability`、`@nestjs/throttler`，其余 hoist 到根） |
| `libs/*` | 共享库（core、contracts、api-contract、ba-mikro-adapter） | 可被应用引用的内部包，`libs/core` 通过 `exports` + `typesVersions` 暴露子路径导出 |
| `packages/*` | 前端产物包（`@saas/api-client`） | 基于 oRPC contract 生成的 typed HTTP 客户端 |

根 `package.json` 的 `workspaces` 字段声明 `apps/*`、`libs/*`；`pnpm-workspace.yaml` 额外包含 `packages/*`。三者共同决定安装范围。

### 3.2 内部包引用约定

- 工作区内包一律使用 `workspace:*` 协议引用，例如根依赖中的 `@core/saas-kit: workspace:*`、`@saas/api-contract: workspace:*`、`@saas/contracts: workspace:*`、`@okee/ba-mikro-adapter: workspace:*`；`packages/api-client` 对 `@core/saas-kit` 和 `@saas/api-contract` 也使用 `workspace:*`。
- 应用包（如 `apps/api`）保持 `private: true` 且仅声明自身运行期所需的少数依赖，其他依赖由根 hoist，避免重复安装。
- 库包（如 `libs/core`）通过 `peerDependencies` 声明框架依赖（`@nestjs/common`、`@nestjs/core`、`@nestjs/cqrs`），把框架版本决策权交给宿主应用。

### 3.3 构建与原生二进制安全

`pnpm-workspace.yaml` 中显式配置 `allowBuilds` 白名单：
- 放行 `@swc/core`、`esbuild`（平台原生二进制）。
- 显式拒绝 `@scarf/scarf`（遥测）、`cpu-features`、`protobufjs`、`ssh2`（testcontainers 可选原生面）。
- 注释说明：pnpm 11 默认拦截 `postinstall` 以保护供应链，此处仅放行必要的原生构建。

### 3.4 版本锁定与更新策略

- 根 `package.json` 中第三方依赖统一使用 `^` 语义化版本（如 `"@nestjs/common": "^12.1.3"`、`"fastify": "^5.12.5"`、`"zod": "^4.6.7"`），具体版本由 `pnpm-lock.yaml` 锁定。
- `libs/core` 对框架依赖使用 `peerDependencies`，版本号与根保持一致（`^12.x`），确保宿主应用提供兼容版本。
- Renovate 配置：
  - 继承 `config:base`，禁用 Dependency Dashboard。
  - 标签 `dependencies`，调度 `every weekend`。
  - `lockFileMaintenance` 每周一凌晨前维护锁文件。
  - `groupName` 将 `@nestjs/*` 聚合为 `nestjs` 组。
  - minor/patch 级别自动合并（`automerge: true`）。
  - `stripe` 包被显式禁用（`enabled: false`），不自动升级。
- `pnpm-workspace.yaml` 中 `minimumReleaseAgeExclude` 排除一组 `@tanstack/router*` 包，绕过最小发布年龄检查。

### 3.5 依赖来源与隔离

- 默认 npm registry 指向 `npmmirror`（中国镜像），海外可通过命令行参数覆盖。
- 无 `GOPRIVATE`、私有 npm token 或 `.npmrc` 中额外的 `//registry.npm.pkg.github.com/:_authToken` 配置；当前未见私有 npm 包（除 `@core/saas-kit`、`@saas/api-contract`、`@saas/contracts`、`@okee/ba-mikro-adapter` 等均为本地 workspace 包）。
- 无 `vendor/`、`node_modules` 下硬编码的第三方源码；`node_modules/` 位于根级（pnpm 默认行为）。

## 4. 约定与约束

- **包管理器固定**：根 `package.json` 的 `packageManager` 字段要求使用 pnpm 11.7.0（由 pnpm 自身校验）。
- **Node 版本下限**：`engines.node >= 22.0.0`（由 pnpm 在安装时校验）。
- **工作区成员**：`apps/*`、`libs/*`、`packages/*` 三个 glob 同时出现在根 `package.json` 的 `workspaces` 与 `pnpm-workspace.yaml` 的 `packages` 中，二者必须一致。
- **内部包引用协议**：工作区内包之间统一使用 `workspace:*` 协议（根依赖与 `packages/api-client` 均已如此），禁止使用 `file:` 引用。
- **框架依赖提升**：NestJS 相关依赖集中在根 `package.json`，库包通过 `peerDependencies` 声明而非直接依赖，避免重复安装。
- **原生构建白名单**：只有 `@swc/core` 与 `esbuild` 被允许执行 `postinstall` 构建；`@scarf/scarf`、`cpu-features`、`protobufjs`、`ssh2` 被显式拒绝。
- **Renovate 规则**：`stripe` 包被禁用自动升级；`@nestjs/*` 包被分组；minor/patch 自动合并；锁文件每周一维护。
- **Registry 地域约束**：`.npmrc` 注释标注“境内镜像（§6 地域约束）”，默认使用 npmmirror，海外需手动指定 `--registry=https://registry.npmjs.org`。
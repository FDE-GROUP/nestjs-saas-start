# NestJS 多租户 SaaS 启动模板

<p align="center">
  <a href="https://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">我们将从一个采用 NestJS v12 + Fastify  + Better Auth + CASL + MikroORM + PostgreSQL + Zod 的全新工程骨架开始一步一步地演进：多租户 AI Agent SaaS 框架 > Odoo 全栈应用 > ERP 本体系统 > 多源数据治理与共享，最终成为一个企业综合服务平台。</br>（技术栈及资源选择面向中国大陆地区优化、前后端全栈、持续开发中...）</p>

<p align="center">
  <a href="https://github.com/nestjs/nest" target="_blank"><img src="https://img.shields.io/badge/NestJS-12-E0234E?style=flat&logo=nestjs&logoColor=white" alt="NestJS" /></a>
  <a href="https://www.fastify.io/" target="_blank"><img src="https://img.shields.io/badge/Fastify-5-000?style=flat&logo=fastify&logoColor=white" alt="Fastify" /></a>
  <a href="https://nodejs.org/" target="_blank"><img src="https://img.shields.io/badge/node-%3E%3D%2022-339933?style=flat&logo=node.js&logoColor=white" alt="Node Runtime" /></a>
  <a href="https://pnpm.io/" target="_blank"><img src="https://img.shields.io/badge/pnpm-11-F69220?style=flat&logo=pnpm&logoColor=white" alt="pnpm Package Manager" /></a>
  <a href="https://www.postgresql.org/" target="_blank"><img src="https://img.shields.io/badge/database-PostgreSQL-green.svg" alt="Database" /></a>
  <a href="./LICENSE" target="_blank"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MikroORM-7-00b055?style=flat-square" alt="MikroORM" />
  <img src="https://img.shields.io/badge/Zod-v4-3E63DD?style=flat-square" alt="Zod" />
  <img src="https://img.shields.io/badge/Better--Auth-6366F1?style=flat-square&logo=lock&logoColor=white" alt="Better Auth" />
  <img src="https://img.shields.io/badge/Stripe-Payments-008CDD?style=flat-square&logo=stripe&logoColor=white" alt="Stripe" />
  <img src="https://img.shields.io/badge/Aliyun-OSS-FF6A00?style=flat-square&logo=alibabacloud&logoColor=white" alt="Aliyun OSS" />
  <img src="https://img.shields.io/badge/Tencent-COS-3399FF?style=flat-square&logo=tencentqq&logoColor=white" alt="Tencent COS" />
  <img src="https://img.shields.io/badge/Amazon-S3-FF9900?style=flat-square&logo=amazons3&logoColor=white" alt="Amazon S3" />
  <img src="https://img.shields.io/badge/Pino-Logger-11C877?style=flat-square&logo=pino&logoColor=white" alt="Pino" />
  <img src="https://img.shields.io/badge/Vitest-Test-6cc24a?style=flat-square" alt="Vitest" />
  <img src="https://img.shields.io/badge/Biome-Lint&Format-60A5FA?style=flat-square" alt="Biome" />
  <img src="https://img.shields.io/badge/Docker-Containers-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

## 概览

本项目是一个**面向中国大陆场景、可直接孵化 SaaS 产品的多租户工程模板**：以结构良好的 NestJS 骨架为底座，内置多租户身份、权限、隔离、订阅、支付、存储、邮件、国际化等 SaaS 横切能力，并演示如何以清晰的分层与领域边界组织业务代码。

- **架构形态**：模块化单体（单一部署单元），同时保留向微服务演进的条件——拆分由实际触发判据驱动，而非预先切碎。
- **当前状态**：多租户核心能力已可用——审批制租户生命周期、租户→工作区两级边界、平台/租户/工作区三层权限、仓储层行级数据隔离、平台治理（驳回 / 暂停 / 恢复 / 删除）与结构化审计；前端租户控制台覆盖核心只读视图并持续补全。
- **在建方向**：订阅计费闭环与境内支付通道接入；事件溯源在默认关闭的开关后渐进推进。
- **地域取向**：技术栈与第三方选型优先境内可访问、合规可用的方案（依赖镜像、支付、登录、监控等），并预留 ICP 备案 / 数据驻留 / 个人信息保护法（PIPL）合规要求。

## 特性一览

- Clean Architecture（依赖规则向内·边界以 ports & adapters 落地）+ 垂直切片的模块化单体
- 函数式领域内核：核心业务规则以纯函数与不可变数据表达，副作用隔离在边缘
- 多租户：全局用户 + membership 多对多、两级边界（租户 → 工作区）、行级隔离
- 三层权限：平台级 / 租户级 / 工作区级 RBAC，统一能力（ability）裁决
- 认证：邮箱 + 社交登录（Google/GitHub + 微信、企业微信、钉钉、飞书）、会话与 CSRF 防护
- 校验单源：以 zod 契约同时驱动请求校验、响应序列化与前后端类型
- 支付、对象存储、邮件、日志、i18n 等横切能力抽象为可插拔 provider
- 契约类型由 oRPC router 单一来源派生，类型安全 API 客户端与后端共用同一契约树
- **MCP Agent 导出面（已落地）**：经官方 `@modelcontextprotocol/sdk` 建 `/mcp`（Streamable HTTP·bearer 租级服务凭证·scope 空集 deny-by-default·工具薄壳复用既有应用服务），向 Agent 导出 `tenant.directory` / `posts.list` / `workspace.create`（落 `features/mcp`·与 `modules/` 双向隔离）
- **oRPC（现栈）**：对外接口面统一走 oRPC（`@orpc/nest` contract 模式·`/api/v1` 路径与 REST 逐字节兼容），契约类型由 router 从 `@saas/contracts` zod 单源派生；`openapi.yaml` 退出提交态 SSOT，仅保留生成态文档面（非 SSOT·不入闸）。MCP 面仍复用官方 SDK 落 `features/mcp`，与 oRPC 零冲突
- 本地 CI 一键质量门禁 + Git Hooks；容器化开箱即用

## 技术栈

- **运行时**：Node LTS ≥ 22（ESM，`"type": "module"`；开发经 `nest start --watch`，生产运行 SWC 编译产物）+ pnpm（workspace 包管理）
- **框架**：NestJS 12 + Fastify 5
- **传输 / 契约层**：oRPC（`@orpc/nest` contract 模式·v2 beta）统一对外 HTTP 面；公共契约 router 单源居 `@saas/api-contract`
- **架构范式**：Clean Architecture（依赖规则向内·边界以 ports & adapters 落地·同族亦称六边形）垂直切片 + 函数式领域内核；CQRS/ES/EDA **皆按需引入、能力基线完备备能**（简单上下文直接调用服务即为合法终态；被事件化聚合可选「回放即真相」为真相源，简单 CRUD 依法可永不事件化），领域事件用于跨上下文集成与审计；已知范式偏移（auth/BA、authorization/CASL 等）以 `docs/specs/architecture.md`「Paradigm Deviations」登记册为权威
- **数据库 / ORM**：PostgreSQL + MikroORM（迁移与种子）
- **认证**：Better Auth（邮箱 + OAuth、会话 / CSRF）
- **校验 / 契约**：zod 单源——公共 HTTP 面经 oRPC `@Impl(contract)` 的 `.input/.output`；仅残存 REST carve-out（Better Auth / payment webhook / storage upload）经 Nest 官方 standard-schema（`@Body/@Param/@Query({ schema })`、`@SerializeOptions({ schema })`），跨端共享契约单源居 `libs/contracts`
- **授权**：CASL 能力模型 + 自研 RBAC 管理面
- **构建**：SWC（`nest build --builder swc`）
- **测试**：Vitest
- **代码规范**：Biome（lint + format）
- **日志**：Pino 结构化日志
- **支付**：Stripe（海外·已集成）+ 微信支付 / 支付宝（境内·经统一 provider 抽象预留）
- **对象存储**：多云统一接口（AWS S3 / 阿里云 OSS / 腾讯云 COS）
- **邮件**：Nodemailer + MJML 模板
- **API 文档**：OpenAPI（生成态·非 SSOT·供外部消费者）
- **前端**：React 19 + Vite + TanStack Router + Tailwind CSS 4（租户自助面 `apps/web`）
- **契约客户端**：`@saas/api-client`（typed oRPC 客户端·类型锚从 `@saas/api-contract` router 派生）
- **容器化**：Docker + Docker Compose（dev / prod）
- **工程协作**：Husky + Conventional Commits + commitlint

## 架构

业务以**垂直切片**组织：每个限界上下文（bounded context）内部自成 `domain / application / infrastructure / api` 四层，跨上下文仅通过领域事件通信。目录遵循「**层有内容才存在**」——没有实际内容的层不预先铺空壳。仓库以 pnpm workspace 划分共享内核、后端参考应用、前端与契约客户端：

```
libs/
├─ core/src/          # @core 共享内核：领域事件/聚合基类、tenant-isolation/authorization 契约，以及 organizations 生命周期状态机内核（lifecycle/）、subscriptions/workspaces 领域层
├─ contracts/src/     # @saas/contracts 跨端传输契约单源（请求/响应/envelope 的 zod schema + 派生类型）
├─ api-contract/src/  # @saas/api-contract 公共契约 router（AppRouterContract·从 @saas/contracts 派生·前后端类型锚单源）
└─ ba-mikro-adapter/  # Better Auth × MikroORM 适配层
apps/
├─ api/src/           # 后端参考应用（NestJS + Fastify）
│  ├─ modules/<上下文>/        # 限界上下文：users / auth / authorization / organizations / workspaces / platform / payment / storage / subscriptions / posts
│  │  ├─ domain/               # 纯领域内核：entities / value-objects / events / repositories / ports / policies / constants
│  │  ├─ application/          # 用例编排（command/query + handler，或简单 service 直调）
│  │  ├─ infrastructure/       # 仓储实现与外部集成（MikroORM、provider 适配等）
│  │  └─ api/                  # Controller / HTTP 边界
│  ├─ tenant-isolation/        # 多租户横切机制：请求上下文传播、隔离守卫、失权清单
│  ├─ common/ config/ database/ i18n/ logger/ mailer/   # 基础设施
│  └─ main.ts / app.module.ts
└─ web/               # 前端租户自助控制台（React + Vite，经 @saas/api-client 消费后端）
packages/
└─ api-client/        # @saas/api-client：typed oRPC 客户端（类型锚从 @saas/api-contract router 派生）
```

### 共享内核与业务上下文的分界

代码归属看「**谁定义规则、为谁服务**」，而不是看话题是否"关于"认证或租户——同一主题可以拆成机制与业务两面：

- **系统机制**：`auth`（身份认证机器）、`authorization` 的裁决内核（能力投影 / 谓词编译，纯函数、零框架依赖、受纯度守卫）、`tenant-isolation/` 横切层（请求级租户上下文传播、隔离守卫、即时失权），以及 `database` / `config` 等基础设施。这些组件因技术演进（框架升级、第三方换代、性能）而变化。
- **业务域**：各限界上下文的领域规则——`organizations`（租户生命周期与治理）、`workspaces`、`users`、`subscriptions`、`platform` 等，以及 `authorization` 的管理面（角色与授权数据的维护）。这些组件因业务需求而变化，是函数式内核与领域建模的主战场。
- **易混点**：多租户**机制**（`tenant-isolation/`，不关心"租户是什么"）不同于租户**业务域**（`modules/organizations`，定义租户如何创建、暂停、消亡）；`storage` / `payment` 是带领域策略（上传校验、通道降级、金额与货币）的**出站网关上下文**，而非基础设施——真正的设施是其身后的 provider 适配器。

> 完整结构规则见 [`docs/specs/architecture.md`](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/specs/architecture.md)。

## 功能模块

| 上下文 | 职责 |
|---|---|
| `users` | 平台全局用户与成员关系（membership）；PIPL 合规（数据导出 / 硬删级联清除） |
| `auth` | 认证：邮箱密码 / 魔法链接、社交 OAuth、会话与 CSRF；全局会话墙（默认拒绝 + `@Public` 旁路） |
| `authorization` | 授权：CASL 能力投影 + 三层 RBAC 管理面；跨租户鉴权边界默认拒绝 |
| `organizations` | 租户生命周期与治理：审批制状态机、暂停 / 恢复 / 硬删、结构化审计 |
| `workspaces` | 工作区：租户之下的强数据分区（查询默认按工作区复合过滤） |
| `subscriptions` | 订阅与配额：计划、席位、额度（领域层居 `@core`） |
| `payment` | 支付：Stripe 客户 / 支付意图集成；境内通道经 provider 抽象预留 |
| `storage` | 对象存储：S3 / OSS / COS 统一接口 + 上传策略 |
| `platform` | 平台运营面：经营者治理端点与审计 |
| `posts` | 示例内容上下文（演示领域建模与读写的参考切片） |

> **集成专属区**：`apps/api/src/features/`（`odoo-rpc-api` Odoo 只读数据面、`odoo-provisioning` 组织开通 saga、`mcp` Agent 工具面 `/mcp`）为第三方集成专属区，与 `modules/` 双向隔离（无自有 domain、经 published port 读写）；`apps/odoo-rpc-web` 为演示「经 SaaS 只读访问 Odoo」的可选前端壳（opt-in・不入核心门禁）。

## 快速开始

完整安装与运行步骤见 [安装与运行指南](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/install&run.md)。

**前置要求**：Node ≥ 22、pnpm 11、PostgreSQL（或使用 Docker Compose 起库）。

```bash
pnpm install                # 安装依赖
cp .env.example .env        # 配置环境变量（数据库连接等）
pnpm run db:setup           # 应用迁移并写入种子数据

pnpm run start:dev          # 开发后端：http://localhost:7009（API 前缀 /api/v1）
pnpm run dev:web            # 开发前端：Vite http://localhost:5173（/api 反向代理到后端 :7009）

pnpm run build              # 构建：libs → api-client → nest(SWC)
pnpm run start:prod         # 生产运行：node dist/apps/api/src/main.js
```

## 开发与质量门禁

本项目以**本地 CI** 作为主要质量门禁（不依赖远程 CI 才能把关），提交 / 推送前一键校验：

```bash
pnpm run ci          # 完整门禁：check → 类型/布局守护 → build → 全量类型检查 → oRPC 契约对拍 → test
pnpm run ci:quick    # 轻量门禁：check + test
pnpm run test        # Vitest 测试
pnpm run verify:test-types  # 全包测试类型检查（含 *.test.ts·补 build 排测试 + vitest transpile-only 盲区·full ci 内自动跑）
pnpm run ci:db       # 带数据库全链：静态检查 + 测试 + 一次性 PostgreSQL 跑 gated e2e（用完即焚）
pnpm run test:fullstack     # 仅跑上述带库段（ci:db 的 DB 部分·编排器 scripts/ci-fullstack.ts）
```

- **Git Hooks**（Husky）：`pre-commit` 跑 `lint:fix`、`commit-msg` 校验 Conventional Commits、`pre-push` 跑 `pnpm run ci`。
- **提交规范**：Conventional Commits，详见 [约定文档](./COMMIT_CONVENTION.md)。
- **契约对拍**：对外契约类型由 `@saas/api-contract` router 从 `@saas/contracts` zod 单源派生；门禁以「router 叶子集 ⇔ 各域 `*Contract` 叶子集」恒等对拍（`verify:orpc-contract`）拦截漏挂/漂移，取代旧 OpenAPI 字节对拍。
- **代码智能分析**：`fallow`（devDependency）用于架构边界与死代码佐证，结论须人工二次核验后采信。

> **公开 clone 须知·文档与 CI 的耦合**：治理文档（specs / plans / stories 等）住**私有仓**，本公共仓不含 `docs/`——根 `docs` 是指向本地私有 checkout `docs-private/docs` 的软链（`.gitignore` 排除・不入库）。因此 **全新公开 clone 直接 `pnpm run ci`（或 `ci:quick`）会在 stories-drift 闸失败**——该闸对 `docs/stories` 溯源做恒等对拍、缺目录即 fail-loud，系「文档不开源」的必然代价。两种应对：① 本地要让全链绿，先 `git clone <私有文档仓> docs-private` 并建软链 `docs → docs-private/docs`；② 只跑与文档无关的单步（`pnpm run test`、`pnpm run check`）。

## 部署

- 本地 / 依赖服务：`docker-compose.dev.yml`（PostgreSQL、pgAdmin 等）。
- 生产镜像：多阶段 `Dockerfile`；完整部署说明见 [Docker 部署指南](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/docker-deployment.md)。
- 生产回归防线：`pnpm run verify:prod-boot`（构建后真实起服并校验 `/api/v1/health`）。

### 一体化演示镜像（拉取即用 · 面向非开发者试用）

除上述生产部署外，项目提供一个 **all-in-one 演示镜像**：单容器内置 PostgreSQL + Nest SaaS 应用 + 官方 Odoo 20 CE，首启自动烘焙演示数据，供非开发者“拉取即用”体验（**仅演示/试用 · 数据 ephemeral · 非生产**）。

```bash
docker run --rm -p 7009:7009 -p 8069:8069 arligle/odoocn-saas-start:alpha
# 首启 bake 约数分钟，就绪后：
#   SaaS 登录门  http://localhost:7009/      （admin@example.com / admin123）
#   SaaS 前端    http://localhost:7009/app/  （与 API 同源 · 门登录后免二次登录）
#   Odoo 后台    http://localhost:8069/odoo  （在 Odoo 登录页点「使用 SaaS 登录」经 SSO 一键进入）
```

- **同源一次登录、处处已登**：登录门与 API、SaaS 前端同在 `:7009` 同源共享会话（Cookie 不分端口），门登录一次即可免二次登录进 `apps/web`，并经 SSO 单向登录 Odoo（三处背后是同一 SaaS 身份）。
- 完整步骤与真跑对拍见 [一体化演示镜像快速上手](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/odoo-allinone-demo-quickstart.md)。

## 文档

**规格**（`docs/specs/`·约束性规范）

- [项目愿景](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/specs/vision.md)
- [项目架构](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/specs/architecture.md) ｜ [中文](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/specs/architecture-zh.md)
- [工具标准](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/specs/tooling-standards.md)
- [开发工作流程](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/specs/workflow.md)

**指南**（`docs/`·操作手册）

- [函数式领域内核指南](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/functional-core.md)（概念 · 判据 · 地图 · FAQ）
- [安装与运行](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/install&run.md)
- [前端 dev 反代运行手册](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/frontend-dev-proxy-runbook.md)
- [Docker 部署](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/docker-deployment.md)
- [MikroORM 迁移指南](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/mikro-migration-guide.md)
- [邮件模块指南（英文）](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/mailer-en.md)
- [OAuth 认证指南（英文）](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/oauth-guide-en.md)
- [一体化演示镜像快速上手](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/odoo-allinone-demo-quickstart.md)（all-in-one demo：SaaS + Odoo SSO 单向登录 + 前端同域免二次登录）
- **公共 API 参考（TypeDoc）**：本地 `pnpm run docs:api` 生成（读根 `typedoc.json`·纳 `@saas/contracts` + `@core/saas-kit` + `apps/api` 各 module 对外接口·`excludeNotDocumented` 只文档化已注释件）→ 产 `api-docs/`（生成物·不入库）

**设计方案与调研**（`docs/plans/`、`docs/research/`·技术方案与参考资料）

- [方案索引](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/plans/README.md)（多租户、地域适配、事件溯源、前后端契约等各专项方案）
- [Clean Architecture 系列整理](https://github.com/FDE-GROUP/odoo-saas-start/blob/main/docs/research/clean-architecture/README.md)

## 联系方式

<p align="center">
  <img src="./abel-weichat.jpg" alt="WeChat 联系" width="240" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="./chat_Odoo%20ERP.jpg" alt="微信群：Odoo ERP 实施 · FDE拓展" width="240" />
</p>

<p align="center">左：个人微信 · 右：技术交流群（群二维码有时效，过期可加个人微信拉入）</p>

## 许可

[MIT](LICENSE)

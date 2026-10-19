# NestJS 项目模板

<p align="center">
  <a href="https://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">一个采用最佳实践的现代 NestJS 工程骨架：Fastify + MikroORM + PostgreSQL + Node/pnpm，<br/>多租户 SaaS 核心能力已就位（租户→工作区两级、全局用户 + membership、三层权限）。</p>

<p align="center">
  <a href="https://github.com/nestjs/nest" target="_blank"><img src="https://img.shields.io/github/license/nestjs/nest.svg" alt="Package License" /></a>
  <a href="https://nodejs.org/" target="_blank"><img src="https://img.shields.io/badge/node-%3E%3D%2022-339933?style=flat&logo=node.js&logoColor=white" alt="Node Runtime" /></a>
  <a href="https://pnpm.io/" target="_blank"><img src="https://img.shields.io/badge/pnpm-11-F69220?style=flat&logo=pnpm&logoColor=white" alt="pnpm Package Manager" /></a>
  <a href="https://www.postgresql.org/" target="_blank"><img src="https://img.shields.io/badge/database-PostgreSQL-green.svg" alt="Database" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MikroORM-7.2-00b055?style=flat-square" alt="MikroORM" />
  <img src="https://img.shields.io/badge/Better--Auth-6366F1?style=flat-square&logo=lock&logoColor=white" alt="Better Auth" />
  <img src="https://img.shields.io/badge/Stripe-Payments-008CDD?style=flat-square&logo=stripe&logoColor=white" alt="Stripe" />
  <img src="https://img.shields.io/badge/Aliyun-OSS-FF6A00?style=flat-square&logo=alibabacloud&logoColor=white" alt="Aliyun OSS" />
  <img src="https://img.shields.io/badge/Tencent-COS-3399FF?style=flat-square&logo=tencentqq&logoColor=white" alt="Tencent COS" />
  <img src="https://img.shields.io/badge/Amazon-S3-FF9900?style=flat-square&logo=amazons3&logoColor=white" alt="Amazon S3" />
  <img src="https://img.shields.io/badge/Pino-Logger-11C877?style=flat-square&logo=pino&logoColor=white" alt="Pino" />
  <img src="https://img.shields.io/badge/MJML-Email-EB5757?style=flat-square&logo=mail.ru&logoColor=white" alt="MJML" />
  <img src="https://img.shields.io/badge/Docker-Containers-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

## 项目定位

**架构形态**（经人澄清 2026-10-14）：**单体优先**（模块化单体·单部署单元），同时保持**兼容未来向微服务扩展的条件**（接缝/边界/就绪机制见 [microservice-readiness](./docs/plans/microservice-readiness.md)）——演进由触发判据驱动，不为拆而拆。
**现状**：多租户 SaaS 核心能力已落地——审批制租户生命周期、两级边界（租户→工作区）、三层权限与行级隔离、平台治理（驳回/暂停/恢复/删除 + 审计）、事件溯源 Phase B 影子追加（开关缺省关）。
**方向**：订阅计费闭环与境内支付通道接入、ES Phase B 后半（同事务化/投影，待重状态上下文立项）持续推进。
**地域**：面向**中国大陆**用户——技术栈与第三方选型优先**境内可访问 / 合规可用**的方案（依赖镜像、支付、登录、监控等，详见工具标准）。

> 愿景是宪法顶层：详见 [项目愿景 `docs/specs/vision.md`](./docs/specs/vision.md)；多租户需求详见 [`docs/plans/global-tenancy.md`](./docs/plans/global-tenancy.md)。

## 技术栈

- **运行时**：[Node LTS ≥22](https://nodejs.org/)（ESM，`"type": "module"`；开发经 `nest start --watch`、生产运行 SWC 编译产物）+ [pnpm](https://pnpm.io/)（包管理·workspace）
- **框架**：[NestJS 12](https://nestjs.com/) + [Fastify 5](https://www.fastify.io/)
- **架构范式**：六边形架构（= Clean Architecture 依赖规则·ports & adapters）的模块化单体 + **函数式领域内核**（functional core, imperative shell·治理/订阅域）——CQRS 按需（简单上下文 service 直调为合法终态），叠加 **EDA**（领域事件 = 集成契约 + 审计日志·Phase B 影子追加；投影/saga 为触发判据驱动的可选项，见[事件溯源路线图](./docs/plans/event-sourcing-roadmap.md)）
- **数据库**：[PostgreSQL](https://www.postgresql.org/) + [MikroORM](https://mikro-orm.io/)（迁移与种子）
- **认证**：[Better Auth](https://github.com/better-auth/better-auth)（邮箱 + OAuth、会话/CSRF）——保留海外 OAuth（Google/GitHub）；**新增境内登录：微信、企业微信、钉钉、飞书**（自定义 provider；不做手机验证码登录）
- **校验**：[zod](https://zod.dev/)（经 Nest 官方 standard-schema 件 `@Body/@Param/@Query({ schema })` + `@SerializeOptions({ schema })`）；跨端共享契约单源居 `libs/contracts`（class-validator/class-transformer/Joi 已换轨摘除）
- **构建**：SWC（`nest build --builder swc`）
- **测试**：[Vitest](https://vitest.dev/)
- **规范**：[Biome](https://biomejs.dev/)（lint + format）
- **日志**：[Pino](https://getpino.io/) 结构化日志
- **支付**：[Stripe](https://stripe.com/)（海外·已落地）+ 微信支付 / 支付宝（大陆·**规划中**，统一 provider 抽象已预留接入面；周期扣款随通道能力，方案层细化）
- **对象存储**：多云统一接口（[AWS S3](https://aws.amazon.com/s3/) / [阿里云 OSS](https://www.alibabacloud.com/product/object-storage-service) / [腾讯云 COS](https://www.tencentcloud.com/products/cos)）
- **邮件**：[Nodemailer](https://nodemailer.com/) + [MJML](https://mjml.io/) 模板
- **文档**：[Swagger / OpenAPI](https://swagger.io/)（`@nestjs/swagger`）
- **前端**：[React 19](https://react.dev/) + [Vite](https://vitejs.dev/) + [TanStack Router](https://tanstack.com/router) + [Tailwind CSS 4](https://tailwindcss.com/)（租户自助面 `apps/web`）
- **契约客户端**：`@saas/api-client`（由 OpenAPI 生成的类型安全 API 客户端·`packages/api-client`）
- **容器化**：[Docker](https://www.docker.com/)（dev / prod）
- **工程协作**：[Husky](https://typicode.github.io/husky/) + [Conventional Commits](./COMMIT_CONVENTION.md) + commitlint

## 架构

采用**六边形架构（ports & adapters · 即 Clean Architecture 依赖规则）的垂直切片**组织业务：治理/订阅域用函数式领域内核（纯函数 + result-union·基准样例 `canTransition`），简单上下文保持 service 直调（P4 合法终态）；跨上下文经领域事件通信（P3·操作记录语义，当前处 Phase B 影子追加）。目录层**有内容才存在**。以 **pnpm workspace**（`apps/*` · `libs/*` · `packages/*`）组织为共享内核、参考后端应用、前端自助面与类型契约客户端（后端目录按行业惯例命名 `apps/api`，“参考实现”语义由文档承担）：

```
libs/core/src/              # @core 共享内核：领域事件/聚合基类、tenancy 契约、subscriptions/workspaces 领域层
apps/api/src/               # 后端参考应用（NestJS + Fastify）
├─ modules/<上下文>/        # 限界上下文（users / auth / authorization / tenants / workspaces / platform / payment / storage / subscriptions / posts）
│  ├─ domain/               # 实体、值对象、领域事件、仓储接口
│  ├─ application/          # 用例（command/query + handler）、入参/命令编排
│  ├─ infrastructure/       # 仓储实现、外部集成（MikroORM 等）
│  └─ api/                  # controller / HTTP 边界
├─ tenancy/                 # 租户边界：生命周期 / RBAC / 配额 / 会话 / 平台治理 / 隔离
├─ common/ config/ database/ i18n/ logger/ mailer/   # 技术基础设施
└─ main.ts / app.module.ts
apps/web/                   # 前端租户自助面（React + Vite + TanStack Router + Tailwind·@saas/api-client 首消费者）
packages/api-client/        # @saas/api-client：由 OpenAPI 生成的类型安全 API 客户端
```

> 各限界上下文（见 `apps/api/src/modules`）均已按垂直切片就位（S 系列重构已收口）；结构规则以 [`docs/specs/architecture.md`](./docs/specs/architecture.md) 为准。

## 文档

**规格**（`docs/specs/` — 约束性规范）

- [项目愿景](./docs/specs/vision.md)
- [项目架构](./docs/specs/architecture.md) | [中文](./docs/specs/architecture-zh.md)
- [工具标准](./docs/specs/tooling-standards.md)
- [开发工作流程](./docs/specs/workflow.md)

**方案**（`docs/plans/` — 技术方案，开发依据）

- [方案索引](./docs/plans/README.md) · [方案模板](./docs/plans/_template.md)
- [多租户能力需求](./docs/plans/global-tenancy.md)
- [中国大陆地域适配](./docs/plans/global-cn-adaptation.md)（技术方案）
- [事件溯源路线图](./docs/plans/event-sourcing-roadmap.md)

**调研**（`docs/research/` — 参考，非开发依据）

- [Better Auth 承载境内登录渠道](./docs/research/better-auth-cn-providers.md)

**指南**（`docs/` — 操作手册）

- [安装与运行](./docs/install&run.md)
- [前端 dev 反代真跑手册](./docs/frontend-dev-proxy-runbook.md)
- [Docker 部署](./docs/docker-deployment.md)
- [MikroORM 迁移指南](./docs/mikro-migration-guide.md)
- [邮件模块指南（英文）](./docs/mailer-en.md)
- [OAuth 认证指南（英文）](./docs/oauth-guide-en.md)

**提交规范**

- [Conventional Commits 约定](./COMMIT_CONVENTION.md)

## 功能特性

- **分层架构**：关注点分离的模块化 / 垂直切片结构
- **配置管理**：`@nestjs/config` + [zod](https://zod.dev/) 校验（原生 `StandardSchemaV1`），分环境（`config/envs`）
- **异常与响应**：全局异常过滤 + 响应转换拦截器 + 日志拦截器
- **数据库**：MikroORM + PostgreSQL，含迁移（`migration:generate/migration:run`）与种子
- **认证**：Better Auth——邮箱登录/注册 + 社交登录（Google、GitHub + 境内企微/钉钉/飞书 genericOAuth 通道）、会话与 CSRF；全局会话墙（deny-by-default + `@Public` 旁路）
- **多租户**：审批制租户生命周期（状态机单点裁决）、租户→工作区两级边界、三层权限（平台/租户/Workspace RBAC）、仓储层行级隔离（ALS 卡点）、deny-list 即时失权
- **平台治理与合规**：驳回/暂停/恢复/删除治理端点 + 结构化审计（FR-6）；PIPL 硬删级联清除（含事件流补删）
- **事件溯源（Phase B 影子追加）**：领域事件耐久落 `event` 表（两级治理动作 + 驳回，治理事件面收口；注册流事件随架构精度修宪 S1 移除）；`EVENT_PUBLISH_MODE` 缺省 inproc 不落库，CRUD 仍为唯一真相源
- **存储**：多云统一接口（S3 / OSS / COS），抽象基类去重
- **邮件**：MJML 模板化发送（多语言 `i18n`）
- **支付**：Stripe 客户 / 支付意图集成（境内通道规划中·provider 抽象预留）
- **多语言**：`apps/api/src/i18n`（中 / 英 / 日）
- **前端自助面**：`apps/web` 租户控制台（只读可见片·F2a），经 `@saas/api-client` 类型安全消费后端契约
- **可观测**：Pino 结构化日志
- **测试**：Vitest 单元与集成测试
- **代码质量**：Biome lint/format + 本地 CI 门禁（见下）
- **容器化**：Docker（dev / prod）+ Docker Compose

## 快速开始

安装与运行的完整步骤见 [安装与运行指南](./docs/install&run.md)。常用命令：

```bash
pnpm install                # 安装依赖
cp .env.example .env        # 配置环境变量（数据库等）
pnpm run db:setup           # 应用迁移并写入种子（migration:run + seed）

pnpm run start:dev          # 开发：nest start --watch
pnpm run dev:web            # 前端：Vite :5173 · /api 反代 → 后端 :7009
pnpm run build              # 构建：build:libs → build:client（产 @saas/api-client dist）→ build:nest（SWC）
pnpm run start:prod         # 生产：node dist/apps/api/src/main.js
```

## 开发工作流

本项目走**本地 CI 门禁**（不依赖远程 CI），提交前一键校验：

```bash
pnpm run ci          # 完整门禁：check → build → test（+ fallow architecture 佐证）
pnpm run ci:quick    # 轻量门禁：check + test
```

- **Git Hooks**：Husky `pre-commit`（biome `lint:fix`）、`commit-msg`（commitlint）、`pre-push`（跑 `pnpm run ci`）。
- **提交规范**：Conventional Commits，见 [约定文档](./COMMIT_CONVENTION.md)。
- **代码智能分析**：`fallow`（项目 devDependency·经 `pnpm exec fallow`）作为 L2 佐证工具（结果须人工二判），详见 [工具标准](./docs/specs/tooling-standards.md)。

## 联系方式

<p align="center">
  <img src="./abel-weichat.jpg" alt="WeChat 联系" width="240" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="./chat_Odoo%20ERP.jpg" alt="微信群：Odoo ERP 实施 · FDE拓展（群码 7 天有效·至 10/21，过期请联系上方微信拉入）" width="240" />
</p>

<p align="center">左：个人微信 · 右：「Odoo ERP 实施：FDE拓展」群聊（群码有时效，过期可加个人微信拉入）</p>

## 许可

[MIT](LICENSE)

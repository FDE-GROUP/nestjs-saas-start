# 工具使用规范（Tooling Standards）

> 状态：现行 · 适用仓库：`nestjs-saas-start` · 关联文档：[architecture.md](./architecture.md)、[workflow.md](./workflow.md)（流程与工具矩阵 L1–L4）、[mikro-migration-guide.md](../mikro-migration-guide.md)
> 受众: **人 + Agent**（`读者: Agent`——工具红线与命令，须遵循）

本文件定义本项目的**唯一合规工具链**及其使用规则。目的：消除同类工具并存导致的配置漂移、构建失败与运行时陷阱。凡新增/升级工具，须先更新本规范并走一次提交。

## 1. 基本原则

- **单一职责、单一选型**：每类能力（运行时、格式化、测试、迁移……）只允许一个工具，禁止引入同类替代品混用。
- **显式优于隐式**：工具行为（尤其是迁移、格式化、提交校验）必须可复现、可审阅，禁止依赖隐式默认。
- **运行时约束优先**：本项目为 **ESM + Node + 装饰器元数据** 三重约束，任何会擦除运行时类引用或改写导入形态的工具都必须配置豁免（见 §4、§6）。
- **版本以 `package.json` 为准**：本文件只记录选型与约束，精确版本以 lockfile 为唯一事实来源。

## 2. 工具矩阵

| 能力域 | 选型工具 | 版本基线 | 定位 | 强制/推荐 |
|--------|----------|----------|------|-----------|
| 运行时 | **Node（LTS）** | ≥22（当前 22.23） | 执行编译产物、跑脚本（TS 源码经 SWC 编译后运行） | 强制（唯一） |
| 包管理 | **pnpm** | 11.7.0（`packageManager` 锁定） | 安装依赖、workspace 链接、跑脚本 | 强制（唯一） |
| 语言/类型系统 | **TypeScript** | ^5.9.3 | 类型检查；`emitDecoratorMetadata` 必需 | 强制 |
| 应用框架 | **NestJS** | ^12.1.3 | 模块化 DI、装饰器 | 强制 |
| HTTP 适配 | **Fastify**（platform-fastify） | ^5.12.5 | 替代 Express 的平台层 | 强制 |
| CQRS 总线 | **@nestjs/cqrs** | ^12.1.0 | Command/Query/EventBus | 按需（P4 判据：存在跨聚合编排/事务/事件发布的上下文；简单上下文可 service 直调——仅 handler 可省、四目录分层仍强制·架构精度修宪） |
| ORM | **MikroORM** | 7.2.5 | Data Mapper / UoW / 类型安全实体映射 | 强制 |
| 数据库驱动 | **`@mikro-orm/postgresql`**（底层 `pg`） | 7.2.5 | Mikro 的 Postgres 驱动（随包自带 `pg`，无需顶层驱动包） | 强制 |
| 迁移/CLI | **`@mikro-orm/migrations`**（`Migrator`） | 7.2.5 | `migrator.create()` 生成 / `migrator.up()` 执行（经 `tsx` 脚本驱动·无独立 CLI bin） | 强制 |
| 认证 | **Better Auth** | ^1.7.7 | 会话/凭证（自持 Mikro adapter `mikroAuthAdapter`·非社区预置 adapter）；社交/企业渠道经 `genericOAuth`（见 §2.1） | 强制 |
| 校验 | **zod（经 Nest 官方 standard-schema 集成）** | ^4.6.7 | `@Body/@Param/@Query({ schema })` + 官方 `StandardSchemaValidationPipe`（请求）/ `StandardSchemaSerializerInterceptor` + `@SerializeOptions({ schema })`（响应白名单序列化）；契约单源居 `@saas/contracts` | 强制 |
| 配置校验 | **zod + @nestjs/config** | ^4.6.7 / ^12.0.1 | env schema 校验（zod v4 原生 `StandardSchemaV1`·一等消费 `validationSchema`） | 强制 |
| 编译/构建 | **@nestjs/cli + SWC** | cli ^12.0.8 / @swc/core ^1.16.18 | `nest build --builder swc` | 强制 |
| 测试运行器 | **Vitest** | ^5.0.4 | 单元/集成测试 | 强制（唯一） |
| 测试元数据 | **unplugin-swc** | ^1.5.5 | Vitest 下保留装饰器元数据 | 强制 |
| 覆盖率 | **@vitest/coverage-v8** | ^5.0.4 | v8 provider | 强制 |
| HTTP 断言 | **supertest** | ^7.3.1 | 端到端断言（按需） | 推荐 |
| Lint + 格式化 | **Biome** | ^2.5.15 | 单工具替代 ESLint+Prettier（文件级） | 强制（唯一） |
| 代码库智能/静态分析 | **fallow** | 3.33.0 | 前置分析器（非判决）：跨文件仓库图给出未用代码/重复/循环/复杂度/架构边界的**候选线索**；结论须二次人工核验 | 推荐（devDependency · `pnpm exec`） |
| 本地 CI 编排 | **scripts/ci.ts**（node:child_process） | — | 一键全量门禁：`check`→`build`→`test` + fallow 佐证；pre-push 自动触发，**替代远程 CI** | 强制 |
| 一次性测试库供给 | **Testcontainers**（`testcontainers` + `@testcontainers/postgresql`） | ^12.2.1 | `scripts/ci-fullstack.ts`（`pnpm run test:fullstack`，经 `ci:db` 串入）：拉一次性 PG（`postgres:16-alpine`·随机端口）→ 重放基线迁移建 schema → 跑 env-gated 全栈 e2e + BA 一致性套件，用完即焚零足迹；Ryuk 禁用（清理兜底=finally stop + 启动前标签清扫）；**默认 `ci` 仍 DB-free 不变量不动** | 推荐（带 DB 验收面） |
| Git Hooks | **husky** | ^9.1.7 | pre-commit → `lint:fix`；pre-push → `ci` | 强制 |
| 提交校验 | **commitlint** | ^21.2.3 | Conventional Commits | 强制 |
| 日志 | **pino**（+ pino-pretty） | ^10.4.0 | 结构化日志；dev pino-pretty、prod pino/file 落文件（Datadog 已移除） | 强制 |
| API 文档 | **@nestjs/swagger** | ^12.0.2 | `/apidoc` + OpenAPI 导出 | 强制 |
| 清理 | **rimraf** | ^6.1.3 | `prebuild` 清 dist | 强制 |
| 容器/DB 环境 | **Docker Compose** | Docker 29.x | 本地 Postgres 供给 | 强制（dev） |
| 密码哈希 | **bcryptjs** | ^3.0.3 | 纯 JS、免原生编译 | 强制 |
| 支付 | **stripe**（现行）+ 微信支付 / 支付宝（待落地） | ^23.0.0 | 经统一 `PaymentProvider` 多通道抽象（见 §2.1 / [global-cn-adaptation](../plans/global-cn-adaptation.md)） | 领域相关 |
| AI 编码入口（L4） | **AGENTS.md** | — | 面向 agent 的统一项目指令 / 约束入口，与 `.claude/settings.local.json` 并存（定位见 workflow §4 / §9.5） | 推荐 |
| 前端框架/构建 | **React + Vite** | react ~19.3 / vite ^8 | `apps/web` 壳应用：@vitejs/plugin-react + tsc --noEmit 门禁 + vite build（参考栈 OdooThink okee·global-frontend-adoption F0） | 强制（前端面） |
| 前端路由/样式/基元 | **TanStack Router + Tailwind CSS 4 + shadcn 式按需基元** | router ^1.130 / tailwind ^4.3 | 文件式路由；@tailwindcss/vite；组件按需复制（cva/clsx/tailwind-merge/lucide/sonner），**不引整库** | 强制（前端面） |
| 前端测试 | **Vitest + jsdom + @testing-library/react** | 同主仓 Vitest ^5 | web 单测入根 vitest projects 统一跑；Playwright e2e **缓采**（F2 重呈，人裁 2026-10-17） | 强制（前端面） |

### 2.1 地域适配选型（中国大陆）· 状态标注

> 依 [global-cn-adaptation.md](../plans/global-cn-adaptation.md)（技术方案 · **待审计**）D1–D7，记录**人已裁决的选型**。其中「待落地」项**尚未进 `package.json` / 配置**，落地以该 plan **过审计门为前置**（`workflow.md` §3：无已审方案不写码）；本节只登记选型方向，不谎报为现行能力。

| 能力域 | 选型 | 状态 | 说明 / 关联 |
|--------|------|------|------------|
| **支付通道** | Stripe（海外）+ 微信支付 + 支付宝（大陆） | **部分落地**：统一 `PaymentProvider` 端口 + Stripe 收敛已落地（P1，`apps/api/src/modules/payment`）；微信/支付宝 **劣后暂缓**（D9，`PaymentProviderId` 接口位 `alipay`/`wechat_pay` 保留、实现待资质择机开发） | 与存储同构，`PaymentModule.register()` 依配置装配、未配即降级；周期扣款随资质（FR-1/FR-2 · D1 · D9） |
| **登录渠道** | Google/GitHub（保留）+ 微信 / 企业微信 / 钉钉 / 飞书 | 海外现行；**飞书已落地（A1，`genericOAuth`）**；微信/钉钉/企微 **仅留接口·劣后暂缓**（D8） | Better Auth `genericOAuth`；方案 C 邮箱为体、社交为用（`disableSignUp:true`）；**不做**手机验证码登录（FR-3/D2/D3） |
| **依赖镜像** | npm→npmmirror（`.npmrc` + pnpm registry）+ Docker 国内基础镜像 | **已落地**（M1，commit `9e27d63`） | 纯配置；Dockerfile 基础镜像经 ARG 可覆盖（FR-4/D4）。**corepack 不吃 `.npmrc`**：拉 `pnpm` tarball 只认 `COREPACK_NPM_REGISTRY`，境内化须与该 ENV **分别注入**（见 §4.10） |
| **默认语言** | i18n 默认 / fallback 置 `zh`（保留 en/ja）；`nestjs-i18n@10` | **已落地**（L1 分阶 A+B：全局单源 `AppI18nModule`、**邮件正文/主题 + 校验消息均按 locale 本地化**） | 文档中文为准（FR-5/D4）；locale 取 `accept-language`、回退 zh；校验保形由 `StandardSchemaValidationExceptionFilter`（`Issue[]`→`ErrorResponse` 逐字同形 + i18n 译文）；无生成类型时 `translate` key 为 `never`、测试处断言松类型 |
| **日志后端** | pino 默认落文件；**移除** `pino-datadog-transport` | **已落地**（G1，commit `9e27d63`） | 本期**不引**集中监控（SLS/Loki 留后）（FR-6/D6） |
| **对象存储默认** | 默认阿里云 OSS，COS/S3 经 env 切换 | provider 现行；**默认已切 OSS**（S1，境内 region 默认） | 已有 OSS/COS/S3 provider（D5） |
| **合规（PIPL）** | consent 留痕 + 按 user 导出/删除 + 数据驻留境内 region | **已落地**：C1（`consent` 表 + `GET /users/me/data-export` + `DELETE /users/me`，硬删 user + consent `set null` 匿名保留）+ C2（`config/data-residency.ts` 启动校验，DB host 与 storage region 境内 allowlist、strict/warn 分环境） | ICP 归部署、不进代码门禁；导出剔除口令/令牌；Stripe/OAuth 不在驻留范围（FR-7/D7） |

## 3. 选型红线（禁止项）

- **禁止** 使用 bun / npm / yarn 安装依赖 —— 统一 `pnpm` / `pnpm dlx`（corepack 按 `packageManager` 锁定版本）。
- **禁止** 引入 ESLint / Prettier 及任一 `eslint-*`/`prettier` 插件 —— 已由 Biome 全量承担。
- **禁止** 使用 `jest` / `mocha` / `bun test`（`bun:test`）—— 测试统一 Vitest。
- **禁止** Prisma / TypeORM / MongoDB 等第二套 ORM/DB，亦**禁止回迁已退役 ORM** —— 统一 MikroORM + PostgreSQL。
- **禁止** 引入 class-validator / class-transformer / Joi（及任何 `whitelist`/`forbidNonWhitelisted` DTO 装饰器路径）—— 请求/响应校验与配置/env 校验一律 **zod 单源**（global-validation-zod-constitution-amendment 修宪定稿）；Nest 集成只走**官方 standard-schema 件**（`@Body/@Param/@Query({ schema })` / `@SerializeOptions({ schema })`·禁 nestjs-zod/自研 pipe）；跨端共享契约居 `@saas/contracts`。
- **禁止** schema 自动同步（`schema:sync` / push 类隐式对齐）进入 CI/生产做 schema 同步 —— 生产只走显式 `migration:generate`（生成工件）+ `migration:run`（应用迁移）。
- **禁止** 在依赖注入构造函数里对被注入类使用 `import type`（见 §4.3）。
- **禁止** 未经二次人工核验即按 fallow（或任何前置分析器）的结论删除代码/依赖或重构 —— 其输出为候选线索而非判决（见 §4.7）。
- **禁止** 用 `--no-verify` 绕过 husky/commitlint；**禁止** 修改全局 git 身份（提交用内联身份，见 §6）。
- **禁止** 依赖远程 CI 做质量门禁 —— 本仓库 GitHub Actions 仅部署 Swagger Pages，不跑测试/构建；门禁一律在本地经 `pnpm run ci`（pre-push 强制，见 §4.8）。
- **禁止** 把未真跑对拍的部署声明当作可用 —— `Dockerfile`/compose/HEALTHCHECK/workflows 属可执行契约，须以实跑结果（build→run→`/health` 200→`healthy`）存照，且镜像内不得保留产物实际不支持的能力（见 §4.10）。
- **禁止** 前端引入 CRA / webpack 存量工具链与第二 CSS 框架混用 —— 前端统一 Vite + Tailwind 单源（§2 前端行·global-frontend-adoption）；§3 既有 pnpm/Biome/Vitest 全局红线对前端面天然适用。

## 4. 使用规范

### 4.1 运行时与脚本（Node + pnpm）
- 本地运行只通过 `package.json` scripts（经 `pnpm run …`），不裸调 `node dist/…/main.js` 之外的源码入口（会绕过 i18n/模块加载顺序约定）。
- 服务端口 **7009**，全局前缀 `/api`，URI 版本 `v1`（如 `POST /api/v1/workspaces`）。
- 常用：`pnpm install`、`pnpm run start`、`pnpm run start:dev`（`nest start --watch`）、`pnpm run build`（先 `build:libs` 再 `build:nest`）。
- **Node-ESM 源兼容纪律**（运行时修宪 R-η）：Node 不会像 Bun 静默兜底多类 ESM 不兼容——CJS 默认导出（需默认 import 而非 `import * as`）、`__dirname`（ESM 无，用 `fileURLToPath(import.meta.url)` 等价推导）、子路径目录不可裸解（如 `@nestjs/common/serializer` exports 通配无 index 回退→需显式 `@nestjs/common/serializer/index.js`）、dotenv 装载时序（`main.ts` 入口**首个 import** 必为 `./load-env`，令 env 先于 `config/envs/*` 顶层求值注入）。

### 4.2 TypeScript / 构建
- `target`/`module` = `ES2022`，`moduleResolution` = `node`。
- **必须** 同时开启 `experimentalDecorators` 与 `emitDecoratorMetadata`（Nest DI 构造注入依赖）。（校验已换官方 standard-schema 路由参数 schema·对 `design:paramtypes` 依赖下降，但 DI 仍靠元数据，见 §4.3。）
- 构建走 SWC（快）而非 tsc emit；类型检查由 `nest build` 内嵌 TSC 完成（目标 0 issues）。
- `*.test.ts` 不得进入 `dist`（`tsconfig.build.json` 已 exclude）。

### 4.3 装饰器元数据与导入形态（关键陷阱）
- **Controller 的请求/响应契约**：校验与序列化凭 `@Body/@Param/@Query({ schema })` / `@SerializeOptions({ schema })` 的 zod schema 生效——**schema 常量必须值导入**（`import { createPostSchema }`），否则参数装饰器拿不到 schema、校验/序列化整链静默跳过；参数的 TS 载荷型可 `import type`（`z.infer<typeof …>` 或 `@saas/contracts` 派生型），不再依赖旧 class DTO 的 `design:paramtypes`（换轨后 class 请求 DTO 已废·见 §3 红线）。
- **被构造函数注入的类/Provider**（如 `@nestjs/cqrs` 的 `EventBus`/`CommandBus`/`QueryBus`、全局的 `MikroOrmService`）：使用**值导入 + 显式 `@Inject(Class)`** token；仅靠类型注解的隐式注入在 `import type` 下会于**运行时启动**才暴露 `UnknownDependenciesException`。
- 上述两类文件依赖 §5 的 Biome 豁免，防止 auto-fix 回滚。

### 4.4 数据库（MikroORM）
- 迁移流程：改实体定义（`apps/api/src/database/mikro/**`·运行时实体 + 迁移实体经列元数据单一源 `column-meta.ts` 派生）→ `pnpm run migration:generate`（`scripts/mikro-migration-create.ts`·`migrator.create()` 比对「实体元数据 ↔ 库 schema」产增量工件 + 更新 snapshot）→ 审 SQL → `pnpm run migration:run`（`scripts/mikro-migrate.ts`·`migrator.up()` 应用未执行迁移）。
- 迁移工件目录：`apps/api/src/database/mikro/migration/migrations`（基线 `Migration20261016055354` + snapshot·台账表 `mikro_migrations`）；迁移装配 `mikro-migration.config.ts`（与 app boot / `mikro-orm.factory.ts` 解耦·`extensions:[Migrator]` 仅离线工具实例生效）。
- 破坏性 dev 重建走 `pnpm run db:reset`（= `mikro-migrate.ts --fresh`·`schema.drop({ dropMigrationsTable: true })` 删实体表 + 台账后重放）；**切勿指向生产/现网库**（生产只走增量 `migration:run`）。
- `db:seed` / `db:reset` / `db:setup` 为数据准备入口；Postgres 由 `docker compose` 供给。

### 4.5 测试（Vitest）
- 命令：`pnpm run test`（run）、`test:watch`、`test:cov`。
- 用例放被测模块同级 `*.test.ts`；`include` = `['apps/**/*.test.ts', 'libs/**/*.test.ts']`（双包布局，以 `vitest.config.ts` 为准）。
- 遵循既有规范：动态 `import` 必须 `await`；`env` 段提供最小必需环境变量；`testTimeout/hookTimeout` = 20s（全量 DI 图冷启动慢）。
- DI/元数据相关改动须保留 `Reflect.getMetadata('design:paramtypes')` 回归测试与全图 `app.module.test.ts`。

### 4.6 API 文档
- 运行 `pnpm run openapi:export`（DB-free codegen，无需起服务）导出 `openapi/openapi.yaml`。

### 4.7 代码库智能（fallow）
- **定位（关键）**：fallow 是**前置分析 / 候选生成工具**——它输出的是**待核验的线索，不是可直接执行的判决**。任何结论（尤以 dead-code、未用依赖、边界告警）在据此**动手**（删代码、删依赖、重构）之前，**必须进行二次人工核验**。
- **为何必须复核**：fallow 基于静态仓库图，无法感知**运行时反射与框架魔法**调用，故必然存在假阳性与漏判。
- **二次核验（强制流程）**：
  1. `pnpm exec fallow dead-code --type-aware` 收敛候选；
  2. `pnpm exec fallow dead-code --trace <入口>:<符号>` 追踪引用链；
  3. 全仓 `grep`（含非 `.ts`、配置、注释、动态 import）反查；
  4. 处置分级：**真实问题**→修复；**假阳性**→加 `// fallow-ignore-next-line <issue-type>` 抑制并留因由；**存疑**→保留并记录。
  5. 删依赖/删码后跑 `check` + `test` + `build` + 启动冒烟回归（必要时 `verify:prod-boot`）。
- **本项目已实证的假阳性类型（勿据此删除）**：
  - `@nestjs/cqrs` 总线反射调用的 `@CommandHandler/@QueryHandler` 的 `execute`、`@EventsHandler` 的 `handle`；
  - 经实例/`this` 调用但静态图漏判的公共方法（实证：`User.toPublicProjection` 实际被 handler 调用却被报为未用）；
  - 注释内出现的 `import` 关键字（fallow 正确判为未引用，但人工 grep 需排除注释造成的反向误判）；
  - DI 容器注入、装饰器元数据、动态 `require` 等运行时依赖。
- **调用方式**：fallow 现为项目 devDependency，统一经 `pnpm exec fallow ...`（调本地二进制·勿用 dlx 临时拉，缘由见下「版本一致性」），遵守 §3「禁 bun/npm/yarn」红线、不直接用 `npx`。
- **入口命令**：`pnpm exec fallow`（健康/重复/未用一次跑完）、`pnpm exec fallow audit`（仅卡本次变更引入的问题，PR 门禁首选）、`pnpm exec fallow dead-code`、`pnpm exec fallow dupes`、`pnpm exec fallow health --score`。
- **架构边界**：`pnpm exec fallow architecture`（CI 经 package.json 脚本 `fallow:arch`）/ `fallow guard` 提供 layered/hexagonal/feature-sliced 预设，作为 §4（architecture.md）分层依赖规则的**静态佐证**（同样需人工确认，非唯一门禁），与域纯度测试互补。
- **版本一致性**：现为项目 devDependency（`package.json` 精确钉 `3.33.0`·**无 `^`**）。钉 3.33.0 而非 3.33.1 缘由：npmmirror 对 `@fallow-cli/*` 原生平台二进制同步滞后（仅到 3.33.0·缺 3.33.1），装 3.33.1 会使其 optionalDependencies 整组解析失败被跳过、运行时报 `Could not find @fallow-cli/linux-x64-gnu`（dlx 临时拉同因受累）。取镜像够用的 3.33.0 而非将 `@fallow-cli` scope 覆写 npmjs，守 §6 境内镜像优先；镜像补齐后可升版·本工具仍为**推荐佐证**而非强制门禁。
- **退出码约定**：`0` 干净/仅告警，`1` 发现新增问题（正常门禁结果），`2` 输入或运行错误——脚本化时不得用 `|| true` 掩盖 `2`。

### 4.8 本地 CI（Local CI）
- **定位**：本项目**不走远程 CI 做门禁**（GitHub Actions 仅部署 Swagger Pages）。质量门禁在**本地**由 `scripts/ci.ts` 一键执行，等价替代远程 CI。
- **命令**：`pnpm run ci`（full，默认）—— 依序跑 `check` → `build`（`build:libs`→`build:nest`）→ `test` 三道**硬门禁**（快速失败），随后经 package.json 脚本 `fallow:arch`（= `pnpm exec fallow architecture`）作**佐证**（非阻断）；`pnpm run ci:quick` 仅跑 `check` + `test`（跳过 build 与 fallow，供快速回归）。pre-push 固定走 full。另提供 `pnpm run verify:prod-boot`：构建后真起服命中 `/api/v1/health` 200 的**prod 回归防线**（R-δ：CI 绿≠prod 可跑，需真起服实证）。
- **类型门禁族（`build` 之外的 `tsc` 面）**：`check` 后先跑 `verify:type-escape`（逃逸棘轮·full/quick 均）；`build` 之后依序 `Web typecheck`（`apps/web`·其 `tsconfig.json` 含 `src`→意外覆盖 `*.test.tsx`）→ `verify:test-types` → `openapi:drift`。`verify:test-types` 为逐包 `tsc --noEmit`（`apps/api`+`libs/{core,contracts,mikro-adapter}` 各 `tsconfig.json` 已含 `*.test.ts`，加 `packages/api-client/tsconfig.test.json`+`scripts/tsconfig.json` 两个 test-inclusive 配置），封「`build` 走 `tsconfig.build.json` 排测试 + `vitest` transpile-only 不做类型检查」致测试类型错长期潜伏的盲区（posts/auth 两处驱动·见 `plans/module-ci-test-type-gate.md`）；因多次全量 `tsc` 较重，**仅 full 模式**（随 pre-push 强制），`ci:quick` 不加。
- **自动触发**：`.husky/pre-push` 在 push 前执行 `pnpm run ci`；未全绿则阻断 push。禁止 `--no-verify` 绕过（§3）。
- **失败语义**：任一硬门禁非零退出 → 整体 `exit 1`；fallow 步骤即便有发现项或工具缺失也仅告警、不使流水线失败（遵循 §4.7「结论须二次人工核验」）。
- **可复现性**：编排仅用 `node:child_process`（`spawnSync('pnpm', …)`），不引入 bash/Make 等其他编排工具，遵守 §1「运行时统一 Node」。

### 4.9 横切设施落位纪律
- **新横切能力 = 独立目录**（对齐 config/logger/i18n/mailer/database 既有惯例）：实现落 `apps/api/src/<facility>/`；若领域/跨模块需要其抽象，契约落 `libs/core/src/shared-kernel/<concept>/`（如 `context/` 装 ALS 请求上下文、`domain/` 装分页契约），禁止业务模块 import 实现细节。
- **单文件不开目录；第二个同类文件出现时归拢**（YAGNI，不为假想需求预建空目录）；缓存类设施将来立项时按本条落位。

### 4.10 部署声明对拍（Docker / Compose / Actions）
- **探针不得依赖镜像外工具**：容器 `HEALTHCHECK` / liveness 只能使用**镜像内实存**的能力。`node:*-slim` 既无 `wget` 也无 `curl`，沿用 shell 探针会使容器**永远 `unhealthy`**（静默失效·`build` 成功不报错）；统一用运行时自身探测，如 `node -e "fetch(url).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`（零额外 apt 层）。
- **境内化两条注入通道不同**：包管理器 registry 走 `.npmrc`，**corepack 拉 `pnpm` 本体走 `COREPACK_NPM_REGISTRY`**；只配前者会在境内首次构建即卡 `registry.npmjs.org` 解析失败。
- **容器监听默认须与部署语义同源**：镜像不得依赖调用方补 `HOST` 才能对外可达。代码侧面向宿主开发的默认值（本项目 `HOST` 缺省 `localhost`）在容器内会只绑回环，使发布端口**不可达**（转发给代理时为 **502**，走 iptables 转发时为连接被拒 / 被重置——症状随链路而变，但**应用日志零请求记录**是共同特征），症状貌似「应用挂了」实则进程未监听对外接口——此类默认在**镜像层显式覆盖**（`Dockerfile` `ENV HOST=0.0.0.0`），并保持**单一真源**（编排不再双写同一变量）。
- **合规/安全守卫不得以整闸关闭换取可启动**：编排与守卫互斥时，须用**最小逃生阀**表达（如 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 窄放行图内 DB 服务名），其余校验继续生效；「验证时顺手 `*_ENFORCE=false`」跑通的结果**不得作为该编排可用性的证据**，须以守卫开启态实跑存照。
- **部署声明 = 可执行契约，必须真跑对拍**：改 `Dockerfile`/`docker-compose*.yml`/`.github/workflows/*` 后，验收口径为实跑结果（`docker build` EXIT=0 → **裸** `docker run`（不补 `-e HOST` 等纠正变量）真起服命中 `/api/v1/health` 200 → `docker inspect --format='{{.State.Health.Status}}'` 为 `healthy` → compose 全图 `Up (healthy)`），**不得以「配置就位」「构建通过」代替**；Actions 面以真实 run 结论为证。同型教训：声明的路由与代码实现脱节、探针工具不存在，均属「声明有、实现无」且静态门禁全绿无征兆。
- **镜像内不留不可用死面**：若某声明隐含能力而产物实际不支持（如 runner 携迁移工具 `scripts/mikro-migrate.ts`/`mikro-migration-create.ts`，其经 `tsx` 需 `apps/api/src/**.ts` 源与 dev 依赖而产物镜像无源文件 → 容器内迁移跑不通），**删净并在文档写明能力边界**（迁移归运维机/CI），不加「看起来能用」的兼容配置。

### 4.11 分页契约纪律
- **两种信封为列表结果唯一合法形**（单源 `libs/core/src/shared-kernel/domain/pagination.ts`·纯 TS 零依赖）：`CursorPage<T>`（游标）与 `Page<T>`（offset）；绝不临时自造 `{rows, count}`。
- **新列表端点缺省用游标**（兑现 [global-readiness-error-pagination](../plans/global-readiness-error-pagination.md) 切 B·立 readiness §4-④「游标默认」标准）：键集分页基于确定性全序 `(createdAt DESC, id DESC)`，`nextCursor` 为排序键的**不透明 base64url**（防实现细节泄漏·**非授权替代**·租户守卫照旧）。`Page<T>`（offset）仅作需全量计数/任意跳页的治理面例外，不删除。
- **只经 `createPage` / `createCursorPage` 构造**（唯一形状纪律点·对 `items` 浅复制）；入参走 `@saas/contracts` 的 `listPageQuerySchema`/`listCursorQuerySchema`（zod 单源·query 数字转换用 `z.coerce`·core 不引校验），port 只收已裁决的 `PageRequest`/`CursorPageRequest`。
- **畸形游标 = 400**：DTO 先闸 base64url 字符集，适配层 `decodeCursor` 再拦「合法编码但载荷不合法」→`BadRequestException`（先于取 em、不查库）。

### 4.12 前端使用规范（apps/web · 2026-10-17 入宪）
- **同源反代免 CORS**：dev 期 vite proxy 将 `/api/*` 与 `/api/auth/*`（Better Auth）转发至后端 :7009，前端代码只写相对路径；生产部署面（静态服务/同域反代）另片裁定，未裁定前不得声称前端可 prod 部署。
- **Biome 覆盖**：根 `biome.json` 含 tsx（linter 开 react hooks 规则组）；前端不受 §4.3 装饰器约束，但 `useImportType` 对前端无危害可默认。
- **npm registry 可得性对拍**：React 19/Vite 8 等新基线安装首日须实查 npmmirror 可得性（本仓有滞后先例），滞后则降版本并在 plan 登记。
- **后端不得 import 前端制品**（vision §4.7 不反向渗透），前端消费后端只经 HTTP 契约（F1 后为 `@saas/api-client`）。
- **会话认证面**：Cookie + DB Session（与后端既有语义一致），禁自造 token 存取侧机制；email+password 仅限非生产（既有裁点）。

## 5. Biome 规范

- 命令：`pnpm run check`（校验）、`check:fix`/`lint:fix`/`format`（写回）。pre-commit 触发 `lint:fix`。
- **必须保留的豁免**：`overrides` 中对 `**/*.controller.ts`（及按 §4.3 含 DI 的 provider/handler 路径）关闭 `style/useImportType`，避免把值导入擦成 `import type`。
- `files.includes` 保留 `!.claude/**`、`!.qoder/**` 等工具目录排除（历史 ORM 产物目录排除已随该 ORM 退场移除）。
- 提交前 `pnpm run check` 须 **0 errors**。

## 6. Git 与提交规范

- **身份**：使用内联身份提交，不改全局配置 ——
  `git -c user.name='FDE Team' -c user.email='fde.team@example.com' commit ...`
- **类型**：遵循 Conventional Commits —— `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `build` / `ci`。
- **格式**：header ≤100；body 每行 ≤100（受 commitlint `body-max-line-length` 约束）；长行手动换行。
- **钩子链**：pre-commit → `pnpm run lint:fix`；commit-msg → commitlint。禁止 `--no-verify`。

## 7. 命令速查

| 场景 | 命令 |
|------|------|
| 安装依赖 | `pnpm install` |
| 启动/热更/调试 | `pnpm run start` / `start:dev` / `start:debug` |
| 构建 | `pnpm run build`（= `build:libs` → `build:nest`） |
| 校验/修复 | `pnpm run check` / `check:fix` |
| 测试/监听/覆盖 | `pnpm run test` / `test:watch` / `test:cov` |
| 迁移生成/执行 | `pnpm run migration:generate` / `migration:run` |
| 数据 seed/reset/setup | `db:seed` / `db:reset` / `db:setup` |
| OpenAPI 导出 | `pnpm run openapi:export` |
| 代码库健康/审计（fallow） | `pnpm exec fallow` / `pnpm exec fallow audit` / `pnpm exec fallow dead-code` |
| 本地 CI（全量门禁，pre-push 自动触发） | `pnpm run ci` |
| 本地 CI（快速：仅 check+test） | `pnpm run ci:quick` |
| prod 启动回归防线（真起服验 /health） | `pnpm run verify:prod-boot` |

## 8. 升级策略

- 升级走单一 PR/提交，附带 `pnpm run ci`（= check + build + test 三关全绿）+ 启动冒烟全绿。
- 优先最新稳定版；`@types/*` 与实际运行时主版本对齐。
- 任何"同类工具替换"（如换 Lint、换测试运行器）须先修订本规范 §2/§3 并评审后再动。

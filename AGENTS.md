# AGENTS.md

> 用途: **AI 编码工具的 L4 统一入口**（[workflow.md](./docs/specs/workflow.md) §4 / §9.5）| 状态: 候选稿 · P7 | 受众: Agent
> 定位: **消费者·非裁判**——本文件只汇总「当前真相」的**指针**，不复述细节（防双 SSOT 漂移）；与仓库冲突时**以 `docs/specs` / 代码为准**。

## 0. 权威层级（自上而下）
用户当前指令 > 代码 / 实机产物 > `docs/specs/`（宪法）> `docs/plans/`（**已审方案 = 开发依据**）> `docs/research/`（**参考、非依据**）> 本文件。
**判断 / 承诺 / 问责永远归人**（P2）；Agent 是执行者与事实查找者。

## 1. 开工前必读（指针）
- 愿景：[docs/specs/vision.md](./docs/specs/vision.md)
- 结构：[docs/specs/architecture.md](./docs/specs/architecture.md)（[中文](./docs/specs/architecture-zh.md)）
- 流程 / 原则：[docs/specs/workflow.md](./docs/specs/workflow.md)
- 工具与命令 SSOT：[docs/specs/tooling-standards.md](./docs/specs/tooling-standards.md)
- 方案状态单源：[docs/plans/README.md](./docs/plans/README.md)

## 2. 铁律（不得违反）
- **无已审方案不写码**：审计门**强制**（即便单人）；未过审计不得实现。
- **ESM + Node + 装饰器元数据** 约束：Controller 校验/序列化走**官方 standard-schema 路径**（`@Body/@Param/@Query({ schema })` / `@SerializeOptions({ schema })`），**zod schema 必须值导入**（勿 `import type`），否则参数装饰器拿不到 schema、校验/序列化静默跳过；构造函数注入的类仍**必须值导入 + 显式 `@Inject`**（否则 DI 运行时 `UnknownDependenciesException`）（见 tooling §4.3）。Node-ESM 不兼容需人工防（CJS 默认导出、`__dirname`、子路径目录不可裸解如 `@nestjs/common/serializer/index.js`、dotenv 装载时序），见 tooling §4.1 R-η。
- **工具红线**（tooling §3）：只用 `pnpm`/`pnpm dlx`（禁 bun/npm/yarn）；**Biome**（禁 ESLint/Prettier）；**Vitest**（禁 jest/`bun test`）；**MikroORM + PostgreSQL**（禁 Prisma/TypeORM·禁回迁已退役 ORM）；**zod 单源**（请求/响应校验 + 配置/env 一律 zod·官方 standard-schema 件集成，禁 class-validator/class-transformer/Joi·禁 nestjs-zod/自研 pipe，契约居 `@saas/contracts`）；生产只走 `migration:generate`+`migration:run`，破坏性 `db:reset`（`mikro-migrate --fresh`）仅限 dev。
- **fallow 等静态分析结论必须二次人工核验**（大量假阳性源于反射/框架魔法，见 tooling §4.7）。
- **部署声明必须真跑对拍**（tooling §4.10）：改 `Dockerfile`/compose/`HEALTHCHECK`/workflows 后，以实跑链为验收口径（build→容器起服→`/health` 200→`healthy`），“配置就位/构建通过”不算完成；探针只能用镜像内实存能力（slim 无 wget/curl），镜像内不留产物实际跑不通的死面。
- **高危动作须人签核**（workflow §3）：schema 迁移 / 删码删依赖 / 改门禁·CI·husky·commitlint·Biome / 改 `docs/specs` 宪法与公共契约 / **改 `.env`·密钥**——Agent 不得自行执行，**不得写入真实凭证**。

## 3. 常用命令
```bash
pnpm install               # 依赖（registry 见 §6）
pnpm run start:dev         # 开发（nest start --watch，端口 7009，前缀 /api/v1）
pnpm run build             # 构建（build:libs → build:client（产 @saas/api-client dist）→ build:nest --builder swc）
pnpm run test              # 测试（Vitest）；check = Biome（lint+format）
pnpm run ci                # L1 门禁：check → build → test（+ type-escape/各 typecheck 含测试类型闸/openapi 对拍 + fallow 佐证）
pnpm run ci:quick          # 轻量：check + test
pnpm run verify:test-types # 全包测试类型检查（含 *.test.ts·build 排测试+vitest transpile-only 的盲区补位·full ci 内自动跑）
pnpm run ci:db             # 带 DB 全链：check → test → Testcontainers 一次性 PG 跑 gated e2e + BA 一致性套件（用完即焚）
pnpm run test:fullstack    # 只跑上述 DB 段（编排器 = scripts/ci-fullstack.ts）
pnpm run dev:web / build:web  # 前端（apps/web·Vite dev :5173 反代→7009·tooling §4.12）
pnpm run verify:prod-boot  # prod 回归防线：构建后真起服验 /health 200
pnpm run migration:generate / migration:run / db:setup   # 迁移/数据
```

## 4. 门禁与提交
- **L1 = 本地 CI**（`pnpm run ci`，不走远程 CI）；husky：`pre-commit`→`lint:fix`、`commit-msg`→commitlint、`pre-push`→`ci`。禁 `--no-verify`。
- 新增 **gated e2e**（`*.e2e.test.ts`·env-gated 真库）必须同步登记 `scripts/ci-fullstack.ts` 的 `GATED_E2E_FILES`；清单/实存恒等校验已机制 fail-loud（漏登/stale/豁免腐烂三向）——手动单跑绿≠在链。
- **提交**：Conventional Commits + **内联身份**（不改全局）——
  `git -c user.name='FDE Team' -c user.email='fde.team@example.com' commit ...`；header/body 每行 ≤100；subject 勿以大写拉丁字母/大写缩写开头（如「B1 …」触 commitlint subject-case，中文或小写开头即可）。

## 5. 目录地图
pnpm workspace 四包：`libs/core/src`（@core 共享内核：`shared-kernel` + `tenant-isolation`/`authorization`/`platform` 契约 + `modules/{subscriptions,workspaces}` 领域层）、`libs/contracts/src`（@saas/contracts 跨端传输契约单源：请求/响应/envelope 的 zod schema + 派生型·零依赖 @core·wire enum 内联由 apps 对拍测锁漂移·见 global-validation-zod 修宪）、`apps/api/src`（参考应用·目录名取行业惯例：`modules/<上下文>/{domain,application,infrastructure,api}`（users/auth/authorization/organizations/workspaces/platform/payment/storage/subscriptions/posts）+ `tenant-isolation/` 边界层 + `{common,config,database,i18n,logger,mailer}`）与 `apps/web`（前端壳·React+Vite·global-frontend-adoption F0）；文档四区 `docs/{specs,plans,research,recycle}`（`recycle/` 只进不出）。
- **分支说明**：`main` 为唯一工作分支；远端 `gh-pages` 是 CI（`.github/workflows/deploy-swagger.yml` 经 `peaceiris/actions-gh-pages`）自动生成的 GitHub Pages 发布分支（孤儿分支·只装 Swagger 静态产物·与 `main` 无共同祖先），**勿与 `main` 合并、勿手工改动、勿更名**（更名会连带 workflow + 仓库 Pages 源设置双处断裂）。

## 6. 地域与语言
面向**中国大陆**用户：依赖镜像 `npmmirror` / Docker 国内源；第三方选型见 [global-cn-adaptation](./docs/plans/global-cn-adaptation.md)；**文档 / 注释中文优先**。

## 7. 遇到边界
需求不清 / 越界 → **停下**：回改对应 `plan` 留痕或向人提问，**不臆测**、不用启发式掩盖结构缺陷（机制修复不逐模块特判）。
**事实/推断/未知三分**：结论须带取证（代码实存 / 实跑输出）；取不到证时显式标注「推断/未验证」，不得把推测写成事实。

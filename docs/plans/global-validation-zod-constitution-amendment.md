# 全栈校验换轨 zod：修宪提案（class-validator+Joi → zod · 新建 libs/contracts）

> 适用范围: `全局（宪法 · 工具红线 · 公共契约 · 新工作区包）` ← 校验技术栈换轨，覆盖配置层 + 后端请求/响应层 + 前端表单层
> 关联: 外部评审后的技术栈裁定 · `docs/specs/architecture.md`(+zh) · `docs/specs/tooling-standards.md` §3 · `AGENTS.md` §3/§5 · 先例 `global-orm-mikro-constitution-amendment.md`（同量级换轨范式）· 本会话 nestjs-zod 评估
> 性质: **修宪提案（审前方案·不写实现码）**；用户已裁定「引入 nestjs-zod + 用 zod 替代 Joi · 一次性全栈 · 共享契约居新包 libs/contracts」
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 决定与动因（人裁）

- **决定**：以 **zod** 统一全栈校验——**替换 Joi（配置/env 层）** 并 **替换 class-validator+class-transformer（后端 HTTP 请求/响应层）**，前端表单层原生用 zod；Nest 集成经 **nestjs-zod**；前后端**共享**的 zod schema 单源居**新建 `libs/contracts` 包**。
- **动因**：本项目为全栈 TypeScript，前后端统一一套校验 = 一份 schema 同时给运行时校验 / 编译期类型 / OpenAPI 文档，消除跨层手写漂移。
- **量级**：与 ORM 换轨（Drizzle→MikroORM）同级——**改宪法、改工具红线、改公共契约（ErrorResponse + openapi.yaml SSOT）、移除依赖、变更全部 DTO 行为语义**。属 **AGENTS 高危 #1/#3/#5/#6** 复合，实施前每片须人签核。

## 2. 现状取证（实存·非推断）

- **Joi（配置层·1 文件）**：`apps/api/src/config/config.module.ts` 的 `createSchemaForEnv()` 建 `Joi.object`（~30 env 键），经 `@nestjs/config` `validationSchema` 挂载。
  - **顺带收益**：`@nestjs/config` v12 的 `validationSchema` 类型已是 **`StandardSchemaV1`**，zod v4 原生实现之；现码因 Joi 不符该类型而写 `validationSchema: <Joi> as any`——换 zod **消掉此 `as any`**，一等公民（或走 `validate:(c)=>Zod.parse(c)`）。
  - `data-residency.ts` 为纯 TS 启动守卫，**不涉 Joi**，不受影响。
- **class-validator/transformer（请求层·30 文件 / 16 非测试 DTO）**：中心工厂 `apps/api/src/common/validation-pipe.ts` = `nestjs-i18n` 的 `I18nValidationPipe({whitelist,forbidNonWhitelisted,transform,enableImplicitConversion})`，被 `main.ts` + 6 处 gated e2e 共用（SSOT 装配源）。
- **错误契约（公共契约·须逐字保形）**：`common/filters/http-exception.filter.ts` 产 `ErrorResponse{statusCode,message:string|string[],error,timestamp,path,requestId,errorCode?,errors?}`；`common/errors/response-error-detail.ts` **`import type { ValidationError } from 'class-validator'`** + `fromValidationErrors()` 展平；`common/contracts/api-contracts.ts` 用 `@ApiProperty` 固化 envelope/error 外形。
- **i18n 校验本地化**：class-validator 装饰器的 `message` 直接写 i18n key（如 `validate.title.required`），由 CommonModule 的 `I18nValidationExceptionFilter` 渲染译文、只译 `message`、保标准外形。
- **OpenAPI SSOT 链**：`openapi:export`(=`build`→`openapi-codegen.js`→`openapi/openapi.yaml`) → **`openapi:drift`**（重生成后 `git diff --exit-code`，yaml 必须与码逐字相等·CI 硬闸）→ `packages/api-client`（`gen:types`=`openapi-typescript openapi.yaml -o schema.d.ts`·码表 re-export @core）。文档源现为 **26 文件的 `@ApiProperty`**。

## 3. 目标结构

```
libs/contracts   (@saas/contracts)   # 新增·域无关前后端共享契约单源
├── schemas/                          # zod schema（请求/响应/envelope/error-detail）——运行时+类型+文档三态同源
└── index.ts
apps/api     → 绑定 contracts schema 为 Nest DTO（createZodDto）+ zod 版校验管/异常过滤器
apps/web     → 复用同一 contracts schema 做表单校验（react-hook-form/zod resolver 或原生）
```
- **`libs/contracts` 定位**：仅放**跨前后端共享**的传输契约（zod schema + 派生类型），**不含领域逻辑**（领域仍在 `libs/core`·saas-kit 不变）、**不含 Nest/HTTP/ORM**（适配在 `apps/api`）。与 `packages/api-client`（由 openapi.yaml **生成**的产物）分工：**手写 zod 契约居 contracts，生成 typed client 居 api-client**。
- 须并入 `pnpm-workspace.yaml`、`tsconfig.json` 路径别名 `@saas/contracts`、`biome.json`、`fallow` 边界。

## 4. 执行切片（即便「一次性」也须依赖序落地·每片过门禁）

- **S0 预检 spike（存在性风险·不过则本提案回炉）**：四项硬门槛以真跑取证——
  1. `createZodDto` 产的匿名 class DTO × **DI 装饰器元数据铁律**（`design:paramtypes` 仍在·`@Body` 值导入不退化）；
  2. nestjs-zod `ZodValidationPipe` 复刻现管语义（whitelist/forbid 非白名单→400、query 隐式数字转换经 `z.coerce`）；
  3. `ZodError` → 现有 `ErrorResponse`/`ResponseErrorDetail` 同形 + `validate.*` i18n key 本地化对拍；
  4. zod schema → OpenAPI（`cleanupOpenApiDoc` 入 `openapi-codegen.js`）→ `openapi:drift` 可绿。
- **S1** 新建 `libs/contracts` 包骨架 + 加 `zod`/`nestjs-zod` 依赖 + workspace/tsconfig/biome/fallow 接线。
- **S2** 配置层 Joi→zod：改 `config.module.ts`（`StandardSchemaV1`/`validate`）+ 移除 `as any`。
- **S3** 契约上移：把 16 个请求/响应 DTO 的 zod schema 落 `libs/contracts`；apps/api 侧以 `createZodDto` 消费。
- **S4** 校验管换轨：`validation-pipe.ts` 工厂由 `I18nValidationPipe` 改 zod 版（保持 SSOT 单源·main.ts/e2e 装配点不动）。
- **S5** 错误契约 + i18n：`response-error-detail.ts` 出 zod 变体（`ZodError` 展平）；ZodError→i18n 本地化过滤器；`ErrorResponse` 外形逐字不变。
- **S6** OpenSSOT 重生成：接 `cleanupOpenApiDoc`、重生成 `openapi.yaml`（**yaml 本体漂移须人审 diff**）、重生成 api-client typed、`openapi:drift` 转绿。
- **S7** 响应序列化/PII：裁定保留 `TransformInterceptor` 还是采 `@ZodResponse` 白名单序列化（二者择一·防字段泄露等价）。
- **S8** 前端接入：`apps/web` 复用 contracts 做表单校验。
- **S9** 摘旧依赖：移除 `joi`、`class-validator`、`class-transformer`（及不再用的 nestjs-i18n 校验管件），全仓 grep 验无残留。
- **S10** 修宪落笔（**置于实现之后**·先修宪后实施的镜像纪律）：`architecture.md`(+zh)、`tooling-standards.md` §3 红线、`AGENTS.md` §3/§5 与铁律、`vision.md` 相关处、README 状态单源。

## 5. 完成判据（验收）

- [ ] S0 四项 spike 真跑通过并留证。
- [ ] `pnpm run ci` 全绿；`pnpm run ci:db` gated e2e 全绿（含 `validation-i18n.e2e`、`auth-http-surface.e2e`、`tenant-isolation.e2e`、`api-contracts.test`、controller 元数据回归）。
- [ ] `pnpm run openapi:drift` 绿；`openapi.yaml` diff 经人审签字（契约漂移显式接受）。
- [ ] `pnpm run verify:prod-boot` 绿（真起服 `/health` 200）。
- [ ] `joi`/`class-validator`/`class-transformer` 全仓零引用、依赖摘净、`pnpm install` 干净。
- [ ] `ErrorResponse` 外形与换轨前逐字一致（契约回归对拍）；`validate.*` 文案_locale 对等。
- [ ] 前端消费 contracts 表单校验最小闭环跑通。

## 6. 风险与对策

| 风险 | 性质 | 对策 |
|------|------|------|
| nestjs-zod 单作者 + 高频弃 API | 供应 | 精确 pin 版本；预研自研 zod pipe 作回退（不锁死 nestjs-zod）|
| DI 装饰器元数据铁律回归（`design:paramtypes` 退化）| 存在性 | S0.1 门·不过即不实施；沿用值导入 + 显式 `@Inject` 惯例 |
| i18n 校验本地化链路断裂 | 契约/体验 | S0.3 门·ZodError→key 映射专测·保 `validate.*` 目录 |
| openapi.yaml SSOT 漂移波及前端 typed 面 | 公共契约 | S6 人审 diff·api-client 同片重生成·drift 闸兜底 |
| 行为语义静默变（whitelist/forbid/数字转换）| 正确性 | S0.2/S4 逐项复刻 + 既有 DTO 行为测试平移 |
| 「一次性全栈」单片过大不可回滚 | 过程 | 分支上按 S1→S10 小步提交·每步门禁绿； constitution/摘依赖殿后·可分点回退 |

## 7. 高危签核清单（实施前置·AGENTS）

- **#1 改公共契约**：`ErrorResponse`（须证逐字保形）、`openapi.yaml`（SSOT 漂移人审）、`libs/contracts` 新增契约面。
- **#3 删依赖**：移除 `joi`/`class-validator`/`class-transformer`。
- **#5 改宪法/工具红线**：`architecture.md`(+zh)、`tooling-standards.md` §3、`AGENTS.md`。
- **#6 改门禁行为**：`openapi:drift`、`ci`/`ci:db` 校验面、（可选）`verify:type-escape` 基线因换轨文件大改需 `--update`。

## 8. 审计记录

- 结论：方向经用户裁定采纳；范围=**一次性全栈（配置+请求+响应+前端）· 共享契约居新建 `libs/contracts`**。本 plan 为审前方案，含 S0 存在性预检门与 S1–S10 依赖序；**未过审计门 + 未逐片签核前不写实现码**。
- 未决项：① S7 序列化二选一（`TransformInterceptor` vs `@ZodResponse`）；② 自研 pipe 回退是否作为主案（弱化 nestjs-zod 依赖风险）；③ `libs/contracts` 是否连响应 envelope 类型一并上移（与 `api-contracts.ts` 关系）。
- 审计人 / 日期：用户裁定范围与归属 · Agent 取证出案 · 2026-10-20

## 9. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 审前提案 | 首版：全栈 zod 换轨修宪提案（范围一次性全栈·新包 libs/contracts·S0 预检门 + S1–S10 切片 + 高危清单）|

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 变更，以当前正文内容为准。

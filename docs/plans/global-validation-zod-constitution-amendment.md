# 全栈校验换轨 zod：修宪提案（class-validator+Joi → zod · 新建 libs/contracts）

> 适用范围: `全局（宪法 · 工具红线 · 公共契约 · 新工作区包）` ← 校验技术栈换轨，覆盖配置层 + 后端请求/响应层 + 前端表单层
> 关联: 外部评审后的技术栈裁定 · `docs/specs/architecture.md`(+zh) · `docs/specs/tooling-standards.md` §3 · `AGENTS.md` §3/§5 · 先例 `global-orm-mikro-constitution-amendment.md`（同量级换轨范式）· 本会话 nestjs-zod 评估
> 性质: **修宪提案（审前方案·不写实现码）**；用户已裁定「zod 统一全栈校验 · 一次性全栈 · 共享契约居新包 libs/contracts」；v0.2.0 主案改**官方 standard-schema 路径**；**v0.3.0：完全不采用 nestjs-zod（连对照组亦撤）·官方 standard-schema 为唯一路径**；响应白名单序列化经官方 `@SerializeOptions({schema})`；envelope/error-detail 契约上移 libs/contracts；**v0.3.1：④ 已裁（strict-by-default + 显式 opt-out）·审计门已过·进 S0**
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 决定与动因（人裁）

- **决定**：以 **zod** 统一全栈校验——**替换 Joi（配置/env 层）** 并 **替换 class-validator+class-transformer（后端 HTTP 请求/响应层）**，前端表单层原生用 zod；**Nest 集成走官方 standard-schema 路径**（NestJS 12.1.3 已内置 `StandardSchemaValidationPipe` + `StandardSchemaSerializerInterceptor` + 参数装饰器 `@Body/@Param/@Query({ schema })` + `@nestjs/swagger` 内置 standard-schema 转换）；**完全不采用 nestjs-zod（连 S0 对照组亦撤）·自研 zod pipe 亦撤销——官方 standard-schema 为唯一路径**；每端点响应白名单序列化经官方 `@SerializeOptions({schema})`。前后端**共享**的 zod schema（含请求 + 响应 envelope/error-detail）单源居**新建 `libs/contracts` 包**。
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

### 2.1 官方框架件实测（v0.2.0 修订主案依据 · `@nestjs/common@12.1.3` 实装核查）

- **`StandardSchemaValidationPipe`**（`@nestjs/common/pipes`）：选项 `transform`(缺省 true)/`validateCustomDecorators`/`validateOptions`/`errorHttpStatusCode`/**`exceptionFactory:(issues: StandardSchemaV1.Issue[])=>any`**；经 `schema['~standard'].validate` 调用、schema 取自**参数元数据**。⚠ **无 `whitelist/forbidNonWhitelisted`** ——多余字段拒斥需在 schema 层 `.strict()` 复刻。
- **参数级 `@Body/@Param/@Query({ schema })`**（`route-params.decorator.d.ts` 实证：`@Query({ schema: z.object({...}) })`）——校验由显式 `{schema}` 携带、**不再依赖 metatype**，对 `design:paramtypes` 铁律依赖下降。
- **`StandardSchemaSerializerInterceptor`**（`@nestjs/common/serializer`·`schema?: StandardSchemaV1`）——官方响应序列化件（S7 主案）。
- **`@nestjs/swagger`** 内置 standard-schema：`StandardSchemaObject = StandardSchemaV1 | StandardJSONSchemaV1`、`SwaggerDocumentOptions.standardSchemaConverter?`、`@ApiResponse({ standardSchema })`、`parameter-metadata-accessor` 读 `standardSchema`。
- **zod 版本**：better-auth 已传递引入 **zod 4.6.7**（peer `^4.0.0`·root 未提升·pnpm 隔离）——直依赖 `zod@^4.6` 须与 BA 对齐至**单一版本**。

## 3. 目标结构

```
libs/contracts   (@saas/contracts)   # 新增·域无关前后端共享契约单源
├── schemas/                          # zod schema（请求/响应/envelope/error-detail）——运行时+类型+文档三态同源
└── index.ts
apps/api     → 经 @Body/@Param/@Query({schema}) 绑 contracts schema + 官方 StandardSchemaValidationPipe（自定 exceptionFactory）+ 官方 StandardSchemaSerializerInterceptor（响应）
apps/web     → 复用同一 contracts schema 做表单校验（react-hook-form/zod resolver 或原生）
```
- **`libs/contracts` 定位**：仅放**跨前后端共享**的传输契约（zod schema + 派生类型），**不含领域逻辑**（领域仍在 `libs/core`·saas-kit 不变）、**不含 Nest/HTTP/ORM**（适配在 `apps/api`）。与 `packages/api-client`（由 openapi.yaml **生成**的产物）分工：**手写 zod 契约居 contracts，生成 typed client 居 api-client**。
- 须并入 `pnpm-workspace.yaml`、`tsconfig.json` 路径别名 `@saas/contracts`、`biome.json`、`fallow` 边界。

## 4. 执行切片（即便「一次性」也须依赖序落地·每片过门禁）

- **S0 预检 spike（存在性风险·不过则本提案回炉）**：四项硬门槛以真跑取证（唯一路径=官方 standard-schema·不引 nestjs-zod）——
  1. 全局 **`StandardSchemaValidationPipe`**（经 `validation-pipe.ts` SSOT 工厂装配·含自定 `exceptionFactory`）× 参数级 **`@Body/@Param/@Query({schema})`** 在 Nest 12.1.3 实跑生效（校验触发、类型经 `z.infer` 落地·`design:paramtypes` 铁律在此路径下影响面复核）；
  2. 行为对拍：现管 `whitelist/forbidNonWhitelisted/transform/enableImplicitConversion` → 官方管**无对应白/黑名单选项**，故多余字段拒斥改由 **schema 层 `.strict()`** 复刻、数字转换由 **`z.coerce`/`.transform`** 复刻；
  3. `StandardSchemaV1.Issue[]` →（`exceptionFactory`）现有 `ErrorResponse`/`ResponseErrorDetail` **逐字同形** + `validate.*` i18n key 本地化对拍；
  4. `@nestjs/swagger` 内置 **standard-schema 转换**（`standardSchemaConverter`/`StandardJSONSchemaV1`）经 `openapi-codegen.js` 直出 `openapi.yaml`——判明 zod 侧是否**零配置**或仅需薄封装 `z.toJSONSchema` → `openapi:drift` 可绿。
- **S1** 新建 `libs/contracts` 包骨架 + **直依赖 `zod@^4.6`**（与 better-auth 传递的 4.6.7 对齐）+ `pnpm why zod` **单一版本**判据（与 BA 共版·禁双 zod 实例）+ workspace/tsconfig/biome/fallow 接线（不引 nestjs-zod）。
- **S2** 配置层 Joi→zod：改 `config.module.ts`（`StandardSchemaV1`/`validate`）+ 移除 `as any`。
- **S3** 契约上移：将 16 个请求 DTO **及响应 envelope/error-detail** 的 zod schema 均落 `libs/contracts`；apps/api 侧经 `@Body/@Param/@Query({schema})` 消费请求、`@SerializeOptions({schema})` 消费响应（无需 class DTO 包装·类型取 `z.infer`）；`api-contracts.ts` 的 `ApiEnvelope/ApiErrorDetail/ApiErrorResponse` `@ApiProperty` 类退为 contracts 派生。**契约提供 `strictObject()` helper（默认严格）**，开放输入端点逐 schema 显式 `.passthrough()`+注释（见 §8 ④）。
- **S4** 校验管换轨：`validation-pipe.ts` 工厂由 `I18nValidationPipe` 改**官方 `StandardSchemaValidationPipe`**（含 `exceptionFactory`·保持 SSOT 单源·main.ts/e2e 装配点不动）。
- **S5** 错误契约 + i18n：`ResponseErrorDetail`/`ErrorResponse` 契约**上移 `libs/contracts` 为 zod 单源**；`response-error-detail.ts` 出 `Issue[]`→明细 展平（不再依赖 class-validator）；`Issue[]`→i18n 本地化过滤器；`ErrorResponse` 外形逐字不变。**⚠ S0-G3 发现**：`exceptionFactory` 产出的 `Issue.message` **仅当字段显式设了 `error:` 才是 i18n key**，未设的节点会漏 zod 默认英文（如 `Invalid input: expected boolean`）——故**每个 schema 节点必须挂 i18n key**（`strictObject` helper 配套默认文案）或过滤器加 translate-fallback（未命中 key 则回退），否则原始英文泄漏。
- **S6** OpenAPI SSOT 重生成：经 `@nestjs/swagger` 内置 standard-schema 转换（必要时薄封装 `z.toJSONSchema`）、重生成 `openapi.yaml`（**yaml 本体漂移须人审 diff**）、重生成 api-client typed、`openapi:drift` 转绿。**⚠ S0-G4 发现**：官方件**零配置**即可将 `@Body({schema})` 的 zod 直出 openapi requestBody（strict→`additionalProperties:false`），但 schema 走 **inline 而非 `$ref`**（`components.schemas` 为空）——现 yaml 由 `@ApiProperty` 类产 `$ref` 组件，换轨后为 **结构性大 diff**（非逐字段小改）→ S6 人审需按结构迁移口径验收。
- **S7** 响应序列化/PII：取官方 **`@SerializeOptions({schema})` + 全局 `StandardSchemaSerializerInterceptor`** 做每端点响应**白名单序列化**（= @ZodResponse 的序列化面·不引 nestjs-zod）。⚠ 实查：现 `TransformInterceptor` **仅做成功 envelope 包裹**（`{data,meta?,statusCode,message}`·含分页特例）、**不做字段白名单**——故 `@SerializeOptions` 为**新增能力**（fail-closed 剥未声明字段/PII）而非替换；`TransformInterceptor` **保留**，序列化只作用于 `data` 载荷（两拦截器嵌套次序 S0 判明）；文档面取 `@ApiResponse({standardSchema})`。
- **S8** 前端接入：`apps/web` 复用 contracts 做表单校验。
- **S9** 摘旧依赖：移除 `joi`、`class-validator`、`class-transformer`（及不再用的 nestjs-i18n 校验管件），全仓 grep 验无残留。
- **S10** 修宪落笔（**置于实现之后**·先修宪后实施的镜像纪律）：`architecture.md`(+zh)、`tooling-standards.md` §3 红线、`AGENTS.md` §3/§5 与铁律、`vision.md` 相关处、README 状态单源。

## 5. 完成判据（验收）

- [x] S0 四项 spike 真跑通过并留证（2026-10-20·DB-free 最小 app·6/6 绿·取证见 §8）。
- [ ] `pnpm run ci` 全绿；`pnpm run ci:db` gated e2e 全绿（含 `validation-i18n.e2e`、`auth-http-surface.e2e`、`tenant-isolation.e2e`、`api-contracts.test`、controller 元数据回归）。
- [ ] `pnpm run openapi:drift` 绿；`openapi.yaml` diff 经人审签字（契约漂移显式接受）。
- [ ] `pnpm run verify:prod-boot` 绿（真起服 `/health` 200）。
- [ ] `joi`/`class-validator`/`class-transformer` 全仓零引用、依赖摘净、`pnpm install` 干净。
- [ ] `ErrorResponse` 外形与换轨前逐字一致（契约回归对拍）；`validate.*` 文案_locale 对等。
- [ ] **官方管版本锁定回归**：一份 `StandardSchemaV1.Issue[]`→`ErrorResponse` 对拍测随官方 `StandardSchemaValidationPipe` 钉死行为（官方 API 较新·次/小版本可能改默认行为），纳入 `pnpm run ci`——防框架小版本静默漂移。
- [ ] 前端消费 contracts 表单校验最小闭环跑通。

## 6. 风险与对策

| 风险 | 性质 | 对策 |
|------|------|------|
| 官方 `StandardSchemaValidationPipe` API 较新·次/小版本或改默认行为 | 存在性/回归 | 主案由官方件承担；§5 新增 `Issue[]`→`ErrorResponse` 版本锁定对拍测进 `ci`（唯一路径·无 nestjs-zod 退路·钉行为防漂移）|
| DI 装饰器元数据铁律（`design:paramtypes`）| 正确性 | 官方路径改由 `@Body({schema})` 携 schema·对 metatype 依赖下降；S0.1 仍实测值导入不退化并复核影响面 |
| 官方管无 whitelist/forbid 选项 | 行为语义 | 多余字段拒斥下沉 schema `.strict()`、转换走 `z.coerce`（S0.2 逐项对拍）|
| i18n 校验本地化链路断裂 | 契约/体验 | S0.3 门·ZodError→key 映射专测·保 `validate.*` 目录 |
| **S0-G3**：未设 `error:` 的 schema 节点漏 zod 默认英文（非 i18n）| 契约/体验 | **每节点必挂 i18n key**（`strictObject`+默认文案）或过滤器 translate-fallback·回归测断言无英文残留 |
| **S0-G4**：官方件将 schema 以 inline 而非 `$ref` 写入 openapi | 公共契约/文档 | 接受结构漂移·S6 按「$ref→inline 结构迁移」口径人审 diff·必要时用 `resolver`/薄封装回填 `$ref` |
| **S1**：zod v4 默认对象静默 strip 未知键（非 passthrough）且外层 `.strict()` 不向嵌套继承 | 行为语义 | 复刻 `forbidNonWhitelisted` 需**逐层用 `strictObject`**（嵌套子对象各自 strict）·已由 `libs/contracts` 单测锁定此语义 |
| openapi.yaml SSOT 漂移波及前端 typed 面 | 公共契约 | S6 人审 diff·api-client 同片重生成·drift 闸兜底 |
| 行为语义静默变（whitelist/forbid/数字转换）| 正确性 | S0.2/S4 逐项复刻 + 既有 DTO 行为测试平移 |
| 「一次性全栈」单片过大不可回滚 | 过程 | 分支上按 S1→S10 小步提交·每步门禁绿； constitution/摘依赖殿后·可分点回退 |
| @ZodResponse 「序列化+文档+状态码三合一」便利在官方路径下拆分 | 体验 | 接受·换取零 nestjs-zod 依赖；官方拆为 `@SerializeOptions`+`@ApiResponse({standardSchema})`+`@HttpCode`，由薄封装组合子（如现 `apiOk()`）收敛样板 |

## 7. 高危签核清单（实施前置·AGENTS）

- **#1 改公共契约**：`ErrorResponse`（须证逐字保形）、`openapi.yaml`（SSOT 漂移人审）、`libs/contracts` 新增契约面。
- **#3 删依赖**：移除 `joi`/`class-validator`/`class-transformer`。
- **#5 改宪法/工具红线**：`architecture.md`(+zh)、`tooling-standards.md` §3、`AGENTS.md`。
- **#6 改门禁行为**：`openapi:drift`、`ci`/`ci:db` 校验面、（可选）`verify:type-escape` 基线因换轨文件大改需 `--update`。

## 8. 审计记录

- 结论：方向经用户裁定采纳；范围=**一次性全栈（配置+请求+响应+前端）· 共享契约居新建 `libs/contracts`**；**唯一路径=官方 standard-schema 件（nestjs-zod 完全不采用·自研撤销）**。**审计门已过（用户 2026-10-20 签核审计通过·授权进 S0）**；S1–S10 实施阶段逐片仍遵高危签核（改宪法/摘依赖/改契约/CI）不自行越界。
- 未决项（v0.3.1 已全部收敛）：① 响应序列化定官方 `@SerializeOptions({schema})`（@ZodResponse 能力映射）；② ~~自研 pipe~~ / ~~nestjs-zod 对照组~~ → **均撤销**；③ **已裁**：envelope/error-detail 一并上移 `libs/contracts`（与 `api-contracts.ts` 合并为 zod 单源）；④ **已裁（Agent 定）·strict-by-default + 显式 opt-out**：现管已配 `forbidNonWhitelisted:true`（今天多传未知字段本就 400），故 `.strict()` 为**行为保真非回归**（不加反而是静默放开）；每层对象（含嵌套）默认严格，由 `libs/contracts` 的 `strictObject()` helper 承为书写默认以消漏配 footgun；query 数字转换用 `z.coerce`（等价 `enableImplicitConversion`）；**仅**确需开放输入的端点（典型：Stripe webhook 签名原始体）显式 `.passthrough()`/`.loose()` 并注释——使宽松永远有意且可审计。
- **S0 预检结果（2026-10-20·真跑通过）**：DB-free 最小 Nest+Fastify app + 全局 `StandardSchemaValidationPipe`（自定 `exceptionFactory`）+ 探针 controller `@Body/@Query({schema})`，**四门 6/6 全绿**（探针用后即焚·工作区已回净）。G1 官方管×{schema} 生效（coerce 落地）；G2 `.strict()` 顶层+嵌套均拒未知（`unrecognized_keys`）、`z.coerce` 复刻隐转、`.passthrough()` opt-out 可行；G3 `Issue[]`→`errors[{path,code,message}]` 同形 + key 透传（但需每节点挂 key·见 §6）；G4 swagger 零配置直出 inline schema（strict→`additionalProperties:false`·但走 inline 非 `$ref`·见 §6）。**→ 官方 standard-schema 路径可行性成立·无需回炉**。
- **S1 已落地（2026-10-20）**：新建 `libs/contracts`（`@saas/contracts`·镜像 core 包接线：package/tsconfig/tsconfig.build + 根 tsconfig/apps-api tsconfig 别名 + 根 deps `zod@^4.6.7`与`@saas/contracts: workspace:*` + `build:libs` 扩编译 contracts）。导出 `strictObject()`（④ helper）。**实测新增发现**：zod v4 默认对象**静默 strip** 未知键（非 passthrough、非报错），且外层 `.strict()` **不向下继承**→ S3 需逐层 `strictObject`（已由包内单测锁定）。L1 `pnpm run ci` 全绿（663 通过 + contracts 5 例·fallow 无越界）。
- **S2 已落地（2026-10-20）**：`config.module.ts` 配置层 Joi→zod（`.valid`→`z.enum`/`Joi.number`→`z.coerce.number`/`.uri(scheme)`→`z.string().url()`+scheme refine/`.pattern`→`.regex`；`allowUnknown:true`→`.passthrough()`），**移除旧 `as any`**（zod v4 原生 `StandardSchemaV1` 被 `@nestjs/config` v12 `validationSchema` 一等消费）。**关键连带发现·耦合处理**：配置面契约门禁 `verify-config-contract`（不进 `ci` 链·静态四角对拍）**强耦合 `config.module.ts` 结构**——锚点 `const baseSchema = {`/`const betterAuthSchema` + 键名 4 空格缩进 + 旧按字面 `.required()` 判必需键。zod 无 `.required()` 会令判据③静默空集（弱化）→ **裁定不弱化门禁**：(a) 保留 `createSchemaForEnv`/`baseSchema`/`betterAuthSchema` 边界与 4 空格缩进（锚点回归）；(b) 门禁 `flush` 判据由字面 `.required()` 改 **zod 语义推断**（无 `.optional(` 且无 `.default(` 即必填）·实测精确复现旧 Joi 的 **8 必需键集**·判据③强度不降。L1 `pnpm run ci` 全绿 + `verify:config-contract` 三判据 PASSED。
- **S3（契约上移·增量 a：请求 schema 单源落地·2026-10-20）**：将 15 个请求 DTO 文件（~25 类）换轨为 zod schema 单源落 `libs/contracts`（新目录 `src/request/*` + `strict.ts`/`helpers.ts` · index 改 barrel），逐字段复刻旧 class-validator 语义：`@IsString+@IsNotEmpty({key})`→新 `reqString(key)` helper（**修正旧管 G3 隐患**：缺失/空串/类型错三态统一回 key，旧管缺失会漏默认英文）；query/JSON 数字隐转→`z.coerce.number()`；`''→undefined` cursor→`z.preprocess`；`@Matches/@IsIn/@IsObject/@IsEmail`→`.regex/.enum/.record/.email`；对象默认严格（`strictObject`·逐层）；无 key 字段留 zod 默认英文（与旧“非 key 消息透传”一致）。**零依赖裁定**：`@saas/contracts` 不依赖 `@core`（前端可安全消费），wire enum（subject/action/plan）内联字面量 + `apps/api/…/contracts-vocab-parity.test.ts` 对拍锁定与 core 值域逐字一致（防双 SSOT 静默漂移）。**本增量纯加（未改任何生产接线·未翻 controller·未动校验管）**→ ci 全绿（新 680 测·+14 请求 parity +3 vocab）；class DTO 暂留，待各 context 逐片翻 `@Body({schema})`（见下“翻转可行性”裁定）后 S9 摘除。
- 审计人 / 日期：用户裁定范围与归属·审计签核·Agent 取证出案与 S0 实跑 · 2026-10-20

## 9. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 审前提案 | 首版：全栈 zod 换轨修宪提案（范围一次性全栈·新包 libs/contracts·S0 预检门 + S1–S10 切片 + 高危清单）|
| 2026-10-20 | 0.2.0 | 用户修订（入 S0 前） | 主案改官方 standard-schema 路径（nestjs-zod 降为对照组·自研撤销）；S0 重排（S0.1 全局 StandardSchemaValidationPipe+@Body({schema})+exceptionFactory、S0.4 swagger 内置转换）；S1 依赖 zod@^4.6+pnpm why 单版本；新增官方管版本锁定对拍测判据 |
| 2026-10-20 | 0.3.0 | 用户三裁 | ① 响应白名单序列化定官方 `@SerializeOptions({schema})`+`StandardSchemaSerializerInterceptor`（@ZodResponse 能力映射·经查 TransformInterceptor 仅包裹不做白名单·序列化系新增不替换）；② nestjs-zod 连对照组撤除·官方件为唯一路径；③ envelope/error-detail 上移 libs/contracts（与 api-contracts.ts 合并 zod 单源） |
| 2026-10-20 | 0.3.1 | 审计通过 + ④ 裁定 | 审计门已过（用户签核·授权进 S0）；④ 裁为 strict-by-default（`strictObject()` helper）+ 开放输入端点显式 passthrough（与现 `forbidNonWhitelisted:true` 行为保真）；S3 补 helper 接线 |
| 2026-10-20 | 0.3.2 | S0 实跑完成 | S0 四门真跑 6/6 全绿（DB-free 最小 app·探针用后焚）；回写两发现：G3 每节点需挂 i18n key（否则漏 zod 英文）→ S5/§6；G4 swagger 零配置但 schema 走 inline 非 `$ref`→ S6/§6 结构漂移人审；可行性成立·无需回炉 |
| 2026-10-20 | 0.3.3 | S1 落地 | 新建 `libs/contracts`（@saas/contracts 镜像 core 接线）+ 根 deps `zod@^4.6.7`/`@saas/contracts` + `build:libs` 扩编译 + 导出 `strictObject()`；L1 ci 全绿；新发现 zod v4 默认静默 strip、外层 strict 不继承→S3 逐层 strictObject（§6） |
| 2026-10-20 | 0.3.4 | S2 落地 | 配置层 `config.module.ts` Joi→zod（`.passthrough()` 复刻 `allowUnknown`·消 `as any`）；发现契约门禁 `verify-config-contract` 静态耦合 schema 结构且旧按 `.required()` 判必需→裁定不弱化门禁：保 `baseSchema`/4空格锚点 + 门禁 flush 改 zod 语义推断（无 optional/default 即必填·复现同 8 必需键）；ci + verify:config-contract 全绿 |
| 2026-10-20 | 0.3.5 | S3 增量a | 请求契约上移：~25 类→zod schema 单源落 `libs/contracts/src/request/*`（reqString 修 G3 缺失漏英文 · coerce 隐转 · preprocess cursor · 逐层 strictObject）；裁 contracts 零依赖 @core（wire enum 内联 + apps/api vocab 对拍测防漂移）；探针实跑坐实 `StandardSchemaValidationPipe` 无 schema 时原样返回→与现 I18nValidationPipe 可共存→**控制器可逐 context 增量翻转**（非一次原子切换）；本增量纯加·ci 全绿（680 测）。待 S3-b（逐片翻 @Body({schema})）/S4（换管）/S5（Issue[]→i18n） |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.3.3 变更，以当前正文内容为准。

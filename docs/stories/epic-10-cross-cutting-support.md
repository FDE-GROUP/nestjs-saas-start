# Epic 10 · 横切支撑面：响应契约 · 可观测 · 合规基线 · 事件集成

> 旅程: 一个请求在「进出边界」上被统一加工的可感保证，以及平台合规/集成的横切机制 | 上下文: `common`（过滤器/拦截器/hook/校验管/CORS/数据驻留）+ `logger` + `mailer` + `i18n` + `config` + `database/eventing` + `@saas/contracts`（信封单源）
> **视角**：本 Epic 各条角色为「集成方 / 运维 / 开发者 / 平台」，述的是**横切机制**而非某条业务路由——与 [Epic 01 §1.7–1.9](./epic-01-authentication.md)（全局安全墙）、[Epic 09](./epic-09-storage-and-health.md)（存活探针）同属「支撑面」，故独立成 Epic 承载此前 64 条**未覆盖**的能力。
> **请求生命周期序（先立此锚·免各条复述）**：`onRequest hook(requestId)` → `全局守卫墙`（限流→会话→CSRF→租户，见 README 守卫模型）→ `拦截器外层(Logging)` → `全局校验管(standard-schema)` → `拦截器内层(Transform → 白名单序列化)` → handler → 反向出线。**错误路径**由 `APP_FILTER`（校验渲染器 + `@Catch` 兜底）统一收成 `ErrorResponse`。
> 版本: 0.1.0（2026-10-20·深挖代码横切能力补齐·逐件对拍成文）

---

## 响应契约面（10.1–10.5·角色=集成方/前端）

### 10.1 统一错误响应信封
- **作为** 集成方，**我想** 任何失败都收到形状一致的错误体，**以便** 客户端按固定字段解析、排障可关联。
- **验收**：
  - Given 任意未捕获异常/`HttpException`，When 出错误路径，Then `HttpExceptionFilter`（`@Catch()` 兜底）产出 `ErrorResponse`：`{statusCode, message, error, timestamp, path, requestId, errorCode?, errors?}`——外形**单源于 `@saas/contracts/envelope.ts`**（`errorResponseSchema`），非各控制器自拼。
  - Given 异常以 object response 携带 `errorCode`（`throw new ForbiddenException({message, errorCode})`），Then 透传该码；Given 基类 `HttpException(msg, status, {errorCode})`（`getResponse()` 为裸串走不到 object 分支），Then 从**实例属性兜底**取码（覆盖 402 席位超限等）。
  - Given `status >= 500`，Then 以 `loggerService.error` 记栈；Given 4xx，Then `warn`（含响应体 JSON）——**5xx 露栈、4xx 只留摘要**。
  - **诚实边界**：`errorCode` 命名文法为 `NAMESPACE:NAME`（单源 = `@core` `ERROR_CODES`），但过滤器本身**不校验该码合法性**——只透传抛出方给的值；无码时该键缺省（非空串）。
- **溯源**：`HttpExceptionFilter.catch`（`common/filters/http-exception.filter.ts`·`APP_FILTER`·`CommonModule`）· `errorResponseSchema`（`@saas/contracts/envelope.ts`）· `ERROR_CODES`（`@core`）· 关联 plan [`module-common-error-response-contract`](../plans/module-common-error-response-contract.md)。

### 10.2 校验失败逐字段渲染 + 本地化
- **作为** 前端，**我想** 请求参数校验失败时拿到逐字段可读明细（且随语言本地化），**以便** 就地标注表单错误。
- **验收**：
  - Given `@Body/@Param/@Query({schema})` 校验不通过，When 官方校验管抛 `StandardSchemaValidationException(issues)`，Then `StandardSchemaValidationExceptionFilter` 渲染 400：顶层 `message` 为**译文数组**、`errors[]` 为 `{path?, message}` 字段级明细、`error:'Bad Request'`、带 `timestamp/path/requestId`。
  - Given i18n key 命中，Then 按请求 `accept-language` 译（`AcceptLanguageResolver`·缺省回落 `zh`）；**未命中（含 zod 默认英文）原样透传**（不硬译）。
  - **不预填 `errorCode`**（校验面靠 `statusCode + errors[].path` 已可辨型）。
  - **注册序（防漂移）**：本器排在 `HttpExceptionFilter`（`@Catch()` 兜底）之后注册——Nest 反转全局过滤器列表（末位先选），二者 `@Catch` 类型互斥（本类只捕 `StandardSchemaValidationException`）。
- **溯源**：`StandardSchemaValidationExceptionFilter.catch`（`common/filters/standard-schema-validation.filter.ts`）· `StandardSchemaValidationException`/`joinIssuePath`（`common/errors/standard-schema-validation.exception.ts`）· `I18nContext`（`nestjs-i18n`）· 关联 plan [`global-validation-zod-constitution-amendment`](../plans/global-validation-zod-constitution-amendment.md)（S5）。

### 10.3 成功信封与分页形状转换
- **作为** 集成方，**我想** 成功响应有统一信封、分页结果形状可预期，**以便** 通用解包。
- **验收**：
  - Given controller 返回裸数据，When 出线，Then `TransformInterceptor` 裹成 `{data, statusCode, message:'Success'}`。
  - Given 返回 `{items, meta}` 分页对象，Then 提升为 `{data:items, meta, statusCode, message}`（`meta` 键仅此分支出现）。
  - Given 返回值**已是信封形**（含 `statusCode`+`data`），Then 原样透传（不套娃）。
  - **分页契约形状**（单源 `@saas/contracts/response/page.ts`）：偏移页 `{items, total, limit, offset}`、游标页 `{items, hasMore, nextCursor?}`（`nextCursor` 在 `hasMore=false` 缺省）——现网 `Page/CursorPage` **无 `meta` 键**，故 10.3 提升分支实际不触发（如实标注）。
- **溯源**：`TransformInterceptor.intercept`（`common/interceptors/transform.interceptor.ts`·`APP_INTERCEPTOR`）· `apiEnvelopeSchema`（`@saas/contracts/envelope.ts`）· `offsetPageSchema`/`cursorPageSchema`（`@saas/contracts/response/page.ts`）· 关联 [`module-common-pagination-contract`](../plans/module-common-pagination-contract.md)。

### 10.4 响应白名单序列化（PII fail-closed）
- **作为** 平台，**我想** 响应出线只暴露显式声明的字段，**以便** 未声明字段（含误入的 PII）默认不出线（fail-closed）。
- **验收**：
  - Given 端点标 `@SerializeOptions({schema})`，When 出线，Then `StandardSchemaSerializerInterceptor` 按响应 schema 序列化——响应 schema 用**默认 `z.object`（静默 strip）**，strip 即白名单：未声明字段被剥落。
  - Given 端点**无** `@SerializeOptions`，Then 原样透传（逐端点 opt-in·非全局强制）。
  - **注册层次**：序列化器注册在 `Transform` **之后**（最内层）——只作用于 controller 返回的 `data` 载荷（出线前），信封包裹与日志仍在外层不受波及。
  - **Date 保真**：`z.instanceof(Date)` 校验内存对象、输出留 Date 实例经 JSON 转 ISO 串（wire 面逐字不变）。
- **溯源**：`StandardSchemaSerializerInterceptor`（`@nestjs/common/serializer/index.js`·`CommonModule` `useFactory` 注 `Reflector`）· `page.ts` 响应基座 strip 语义 · 关联 plan [`global-validation-zod-constitution-amendment`](../plans/global-validation-zod-constitution-amendment.md)（S7b）。

### 10.5 官方 standard-schema 校验单源（拒未知键）
- **作为** 开发者，**我想** 请求校验只走 Nest 12 官方 standard-schema 路径 + zod 单源，**以便** 免自研管、防 class-validator 复活、契约居 `@saas/contracts`。
- **验收**：
  - Given 参数带 `schema`，When 进入 handler，Then `StandardSchemaValidationPipe`（`createValidationPipe`·`transform:true`）跑 schema；非法经自定 `exceptionFactory` 抛 `StandardSchemaValidationException`（交 10.2 渲染）。
  - Given 参数**无** `schema`（如裸 `@Param('id') id: string`），Then **原样返回**（官方管 `transform` 早退）。
  - **请求面严格**：请求 schema 用 `strictObject` **拒**未知键（→ 400）——与响应面「静默 strip」（10.4）语义相反、有意分界。
  - **值导入铁律**：zod schema 必须值导入，否则参数装饰器拿不到 schema、校验静默跳过（DI 元数据风险）。
- **溯源**：`createValidationPipe`（`common/validation-pipe.ts`·装配单源·生产与 gated e2e 共用）· `main.ts` `app.useGlobalPipes` · 版本锁定回归测 `validation-pipe.contract.test.ts` · 关联 [`global-validation-zod-constitution-amendment`](../plans/global-validation-zod-constitution-amendment.md)（S9 收官）。

---

## 可观测面（10.6–10.7·角色=运维/SRE）

### 10.6 请求关联 id 统一链
- **作为** 运维，**我想** 每个请求有贯穿「响应头 · 日志 · 错误体 · 领域事件」的单一关联 id，**以便** 跨组件串起一次调用轨迹。
- **验收**：
  - Given 入站带 `x-request-id`，When `onRequest` hook，Then **透传优先**；缺省取 Fastify 原生 `req.id`。
  - Then 回写响应头 `x-request-id`，且 CORS `exposedHeaders` 含之 ⇒ **前端可读回**该 id。
  - `requestStorage.run({requestId})` 用 AsyncLocalStorage **包住后续全链**（hook 先于一切 Nest middleware/guard/interceptor，天然覆盖 `/health` 等旁路路由）。
  - **单源消费**：`LoggingInterceptor`（Request/Response 行）、`HttpExceptionFilter`（错误体 `requestId`）、领域事件 `correlationId`（`MikroEventStore` 落 `metadata.correlationId`）三处读同一 ALS 源（`currentRequestId()`），**弃旧自造 `req-${now}-${random}` 孤岛**。
- **溯源**：`requestIdHook`（`common/request-id.hook.ts`·`main.ts` `addHook('onRequest', …)`）· `requestStorage`/`currentRequestId`（`@core/saas-kit/shared-kernel/context/request-context`）· `CORS exposedHeaders`（`main.ts`）· 关联 plan [`module-common-request-correlation`](../plans/module-common-request-correlation.md)（甲裁）。

### 10.7 结构化日志双态（dev 彩色 / prod JSON 文件）
- **作为** 运维，**我想** 开发看彩色日志、生产落 JSON 文件可按字段检索，**以便** 两地各得其所且无 Datadog 外部依赖。
- **验收**：
  - **后端去 Datadog**（`global-cn-adaptation` G1/D6）：生产 `pino/file`（`LOG_FILE` 指定路径·缺省 `logs/app.log`·`mkdir:true`），非生产 `pino-pretty` 彩色（`translateTime`·忽略 pid/hostname）。级别由 `LOG_LEVEL`（缺省 `info`）。
  - Given 生产，Then **同时喂 Nest 默认行到容器 stdout**（`super.log`），dev 跳过避免与 pino-pretty 双打。
  - `LoggingInterceptor` 每请求记 `Request[id]: METHOD url - ip - ua [body]` + pino 结构化字段（`requestId/method/url/ip/userAgent`）；完成记 `Response[id] … responseTimeMs`；出错记 `Response Error[id]` 带 `statusCode`。
- **溯源**：`LoggerService`（`logger/logger.service.ts`·extends Nest `Logger`+pino）· `LoggingInterceptor`（`common/interceptors/logging.interceptor.ts`·`APP_INTERCEPTOR`·`getClientIp` 读 `x-forwarded-for`）· 关联 [`global-cn-adaptation`](../plans/global-cn-adaptation.md)。

---

## 合规与横切防护（10.8–10.10·角色=平台/运维）

### 10.8 PIPL 数据驻留启动守卫（C2）
- **作为** 平台（合规负责人），**我想** 生产启动即校验数据库与对象存储落在**中国大陆境内**，**以便** 违反 PIPL 数据驻留时**拒绝起服**（fail-closed）。
- **验收**：
  - **判定域**：DB host 命中境内模式（`localhost`/回环/RFC1918 私有段/`.cn` TLD/阿里云 regional `*.cn-*.aliyuncs.com`/`*.rds.aliyuncs.com`/腾讯云 `*.myqcloud.com`/`*.tencentcloudapi.com`）；存储 region 命中 per-provider 白名单（`alioss:oss-cn-*` / `tencentoss:ap-{guangzhou…}` / `s3:cn-north-*`）。**额外主机**经 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 并入。
  - **模式由 caller 决定**（纯函数无副作用）：`resolveEnforceMode` → 生产缺省 `strict`、dev/test 缺省 `warn`，`DATA_RESIDENCY_ENFORCE=true/false` 覆写。Given `strict` 且 `errors` 非空，Then 记 error 后 `process.exit(1)`（**拒启**）；Given `warn`，Then 记 warning 继续。
  - **NFR-2 降级**：存储 provider 未配（无 `accessKeyId`）则跳过存储段（不误拦）。
  - **不受约束面（诚实·范围边界）**：Stripe / 境外 OAuth 属**跨境 API 调用**、非个人数据**存储**，落在驻留义务之外，本守卫不拦。
- **溯源**：`assertDataResidency`/`resolveEnforceMode`/`isMainlandDbHost`/`isMainlandStorageRegion`（`config/data-residency.ts`·纯模块）· `main.ts` bootstrap 段（`process.exit(1)`）· 单测 `data-residency.test.ts` · 关联 [`global-cn-adaptation`](../plans/global-cn-adaptation.md)（C2/D7）。

### 10.9 CORS origin 白名单单一真源 + 凭证安全回显
- **作为** 运维，**我想** 跨源策略由一份显式白名单驱动且兼容 cookie 凭证，**以便** 不重蹈 `origin:'*'`+`credentials:true` 的违规组合，并让 CSRF 墙与 CORS 同源。
- **验收**：
  - Given `ALLOWED_ORIGINS`（逗号分隔完整 origin 含 scheme），Then `parseCorsOrigins` 切分/trim/去空→白名单数组；**有效项为空回落 `[]`**（缺省 fallback）⇒ **生产 fail-closed 拒所有跨源**（同源无 `Origin` 头不受影响）。
  - **凭证安全**：`main.ts` 函数式 `origin` 回调——无 `Origin` 头 / 白名单含 `*` / 命中列表 → 放行**并回显具体 origin（非 `*`）**才兼容 `credentials:true`；否则拒（不发头，浏览器阻断）。
  - **单一真源联动**：`corsConfig.origin` 同喂 Better Auth `trustedOrigins`（→ [Epic 01 §1.8](./epic-01-authentication.md) CSRF 墙白名单），一处配置两处一致。
  - **回归锁**：三份 env 的 `cors.origin` 必须是数组、不得回退 `'*'` 字面量（外部评审 🔴-1）。
- **溯源**：`parseCorsOrigins`（`config/envs/cors-origins.ts`）· `main.ts` `fastifyCors` 注册（`corsAllowList`+函数式 origin+`exposedHeaders`）· 契约测 `cors-whitelist.contract.test.ts`/`cors-origins.test.ts` · 关联 [`module-common-cors-whitelist`](../plans/module-common-cors-whitelist.md)。

### 10.10 邮件本地化投递（MJML + i18n）
- **作为** 用户，**我想** 收到的系统邮件（如 magic-link）按我的语言渲染，**以便** 读懂内容；**作为** 平台，需境内可自托管、无外部模板服务依赖。
- **验收**：
  - `MailerService` 经 nodemailer（`MAIL_HOST/PORT/SECURE/USER/PASSWORD`）投递；模板 MJML→HTML（`mjml` 编译），正文/主题按 `lang` 从 `<lang>/emails.json` 取（`title/greeting/message/button/footer` 键）。
  - **默认中文**（`global-cn-adaptation` L1·`renderTemplate` 缺省 `lang='zh'`）。
  - **资产根单点解析**：邮件目录经 `resolveEmailsDir()`（与 i18n loader 同源）——旧 `dirname(import.meta.url)/../i18n/emails` 在**产物布局**下指向无 mjml/json 的目录 → ENOENT；新机制源码/产物同路、**资产缺失启动即抛**。
  - **消费方**：magic-link 发信（见 [Epic 01 §1.3](./epic-01-authentication.md)·非生产链接兼打控制台、生产绝不打印含 token 链接）。
- **溯源**：`MailerService.renderTemplate`/`getEmailTranslations`（`mailer/mailer.service.ts`）· `resolveEmailsDir`（`i18n/assets-root.ts`）· `AppI18nModule`（`i18n/i18n.module.ts`·`fallbackLanguage:'zh'`+`AcceptLanguageResolver`）· 关联 [`global-cn-adaptation`](../plans/global-cn-adaptation.md) L1 / [`module-i18n-assets-resolution`](../plans/module-i18n-assets-resolution.md)。

---

## 事件与集成面（10.11–10.14·角色=平台/集成方/开发者）

### 10.11 领域事件发布三模（ES / EDA）
- **作为** 平台，**我想** 领域事件发布按 `EVENT_PUBLISH_MODE` 在「进程内 / 影子落库 / 事务 Outbox」三模间切换，**以便** 从 EDA Phase A 渐进到耐久事件溯源而不改业务代码。
- **验收**（缺省 `inproc`·与旧布尔未置 true **逐字节等价**）：
  - `inproc`：纯透传进程内 `EventBus.publishAll`，**不触库**（EDA Phase A 语义）。
  - `shadow`：先向 event store 耐久 `append`，再进程内派发；**append 失败如实抛、不进总线**（宁缺勿错发）。
  - `outbox`：**仅在活跃 UoW 事务内** append（`fork()` 经 ALS 复用事务 em·域行与事件行同生共死），**不**进程内派发，投递交 relay（见 10.13）；**事务外调用 fail-loud**（脱了同事务语义即假）。
- **溯源**：`DefaultDomainEventPublisher.publishAll`（`database/eventing/domain-event-publisher.ts`）· `getEventPublishConfig`（`config.service.ts`）· `TransactionScope.current`（`database/eventing/transaction-scope.ts`）· 消费面跨引 [Epic 02 §2.3](./epic-02-tenant-onboarding.md)（`tenant.rejected`）/ [Epic 07 §7.5·§7.10](./epic-07-platform-governance.md)（status transitioned）· 关联 [`module-es-outbox-transactional`](../plans/module-es-outbox-transactional.md)。

### 10.12 事件存储影子追加 + PIPL 补删
- **作为** 平台，**我想** CRUD 仍是唯一真相源、事件仅**追加**落 `event` 表且违约束即 fail-loud，**以便** 既得可追溯流水又不干扰主写、删号时彻底补删个人数据事件。
- **验收**：
  - `append`：空批 noop（不触库）；聚合内 `version` 按 `(aggregateType, aggregateId)` 流 `max+1` 递增（`eventVersion` 是 schema 版本、非序号）；并发窗口与重复 `eventId` 由 DB 唯一键 `(aggregateType, aggregateId, version)` / `event_event_id_key` 兜底——`em.insert` 直发 INSERT，**违约束即如实抛、不静默吞、不重试覆盖**。
  - 每次读写经 `MikroOrmService.fork()` 取独立 em（禁全局 `orm.em`）；`insert`/`nativeDelete` 不经 Identity Map（append-only 最贴）。
  - `deleteByAggregate(aggregateType, aggregateId)`：`nativeDelete` 纯 SQL DELETE 返删除条数，**不受 `EVENT_PUBLISH_MODE` 开关控制**、失败 **fail-loud**（PIPL 级联补删面）。
- **溯源**：`MikroEventStore.append`/`nextVersion`/`deleteByAggregate`（`database/eventing/mikro-event-store.ts`·绑 `EVENT_STORE` token）· `Event` 实体（`database/eventing/entities/event.entity.ts`）· 消费面跨引 [Epic 08 §8.2](./epic-08-user-rights-pipl.md) / [Epic 07 §7.8](./epic-07-platform-governance.md)（删号/删租 purge）· 关联 [`module-users-es-append`](../plans/module-users-es-append.md) / ORM 修宪案 B 切片 3c-ii-C。

### 10.13 Outbox 耐久投递（at-least-once · 表内 DLQ）
- **作为** 平台，**我想** 事件从 `event` 表耐久投递到进程内总线且崩溃可重投、毒行不拖垮 relay，**以便** 达成 at-least-once 且失败可见可查。
- **验收**（仅 `EVENT_PUBLISH_MODE=outbox` 启动 timer·缺省 inproc **零 timer 零触库**不动 DB-free 装配不变量）：
  - 每拍 `FOR UPDATE SKIP LOCKED` 取一批未投递行（`id` 升序=流内保序·多实例并发安全·批量 50）；**后置** `dispatchedAt`（置位前崩溃必重投 = at-least-once）。
  - **拒收比自身新的信封**（`eventVersion > SUPPORTED=1`）→ 行级置 `lastError` + `attemptCount` 顶到上限停止重试（relay 整体不停摆·留表可查）；未知 `eventType`（注册表外）同样 park。
  - 崩溃重投的 `eventId` 命中**去重窗**（有界 LRU·10_000）→ 只标记不再发（**重启窗清空时消费者仍需自身幂等**·roadmap 硬要求声明）。
  - 投递抛错 → `attemptCount+1`+`lastError`，超上限（`MAX_ATTEMPTS=5`）行级停重试并 error 留痕（**DLQ 以表内状态表达·非独立队列**）；`tickOnce` 防重入（上拍未完→立返 0）。
- **溯源**：`OutboxRelay.onApplicationBootstrap`/`tickOnce`/`dispatchRow`/`parkRow`（`database/eventing/outbox-relay.ts`）· `EVENT_TYPE_REGISTRY`（`eventing/event-type-registry.ts`·字符串→类单源·契约测双向锁）· `getEventPublishConfig` · 关联 [`module-es-outbox-transactional`](../plans/module-es-outbox-transactional.md) 切片 C（裁点丙=at-least-once·丁=行级标记跳过）。

### 10.14 API 版本化与 OpenAPI/Swagger 文档面
- **作为** 集成方/开发者，**我想** 服务暴露版本化的 REST 前缀与自描述文档（JSON/YAML），**以便** 按 `v1` 消费、据契约生成客户端。
- **验收**：
  - Given 启动，Then `setGlobalPrefix('api')` + `enableVersioning({URI, defaultVersion:'1'})` ⇒ 全部业务路由挂 **`/api/v1/…`**；Swagger/openapi 路径**豁免前缀**。
  - Given swagger 启用，Then 提供 `/{apidoc}`（`SwaggerModule.setup`·bearer auth·OpenAPI 3.1）、`/openapi.json`，并**额外注册 `/openapi.yaml`**（`js-yaml.dump(document)` 直发）。
  - 文档由装饰器 + `@SerializeOptions({schema})`/`@Body({schema})` 的 zod 契约共同驱动（契约单源见各业务 Epic 溯源）。
- **溯源**：`main.ts` bootstrap（`setGlobalPrefix`/`enableVersioning`/`DocumentBuilder`/`SwaggerModule`/`/openapi.yaml` route）· `getSwaggerConfig`（`config.service.ts`）· CI 部署 `.github/workflows/deploy-swagger.yml` · `openapi/openapi.yaml`。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）**深挖代码横切能力**补齐此前 64 条未覆盖的支撑面：响应契约（10.1 错误信封 / 10.2 校验渲染+i18n / 10.3 成功信封+分页 / 10.4 白名单序列化 PII fail-closed / 10.5 官方 standard-schema 校验单源）、可观测（10.6 requestId 关联链 ALS 单源 / 10.7 pino 结构化日志双态去 Datadog）、合规横切（10.8 PIPL 数据驻留启动守卫 C2 strict 拒启 / 10.9 CORS 白名单单一真源+凭证安全回显 / 10.10 邮件本地化 MJML+i18n 资产根单解）、事件集成（10.11 发布三模 inproc/shadow/outbox / 10.12 影子追加+PIPL 补删 / 10.13 Outbox at-least-once 表内 DLQ / 10.14 版本化+OpenAPI 文档面）。逐条据 `common`/`config`/`logger`/`mailer`/`i18n`/`database/eventing`/`@saas/contracts` 实存代码取证·负向与诚实边界（strip 语义分界·分页 meta 不触发·5xx 露栈·跨 API 调用不受驻留约束·去重窗重启失效·DLQ 非独立队列）如实登记。

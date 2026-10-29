---
kind: logging_system
name: 基于 pino 的结构化日志系统（NestJS LoggerService + LoggingInterceptor）
category: logging_system
scope:
    - '**'
source_files:
    - apps/api/src/logger/logger.service.ts
    - apps/api/src/logger/logger.module.ts
    - apps/api/src/common/interceptors/logging.interceptor.ts
    - apps/api/src/common/filters/http-exception.filter.ts
    - apps/api/src/common/request-id.hook.ts
---

## 1. 使用的框架与工具

- **日志后端**：`pino`。`LoggerService` 在构造时根据 `NODE_ENV` 选择 transport：
  - 生产环境（`NODE_ENV === 'production'`）：`pino/file`，默认写入 `logs/app.log`，可通过 `LOG_FILE` 覆盖路径；同时调用 Nest 原生 `super.log/error/warn` 输出到 stdout 供容器收集。
  - 开发/测试环境：`pino-pretty`，开启 `colorize`、`translateTime: 'SYS:HH:MM:ss.l'`，忽略 `pid,hostname`。
- **日志级别**：通过环境变量 `LOG_LEVEL` 控制（默认 `'info'`），直接传给 pino。
- **结构化字段**：所有业务日志以「人可读消息（首参）+ 结构化 meta（次参对象）」的形式调用 `loggerService.log(message, { ... })`，由 `LoggerService.log` 把 meta 作为 pino 的第二个参数传入，实现 dev 下 pretty 展示、prod 下 JSON 可检索。
- **请求关联 ID**：通过 Fastify `onRequest` hook（`requestIdHook`）统一生成/透传 `x-request-id`，并写入 `@core/saas-kit/shared-kernel/context/request-context` 的 ALS 存储；`LoggingInterceptor` 通过 `currentRequestId()` 读取，使请求链路日志具备同一 `requestId` 字段。

## 2. 关键文件与位置

| 文件 | 职责 |
|---|---|
| `apps/api/src/logger/logger.service.ts` | 全局 `LoggerService`，继承 Nest `Logger`，封装 pino 实例与 prod/dev transport 切换 |
| `apps/api/src/logger/logger.module.ts` | `@Global()` 模块，导出 `LoggerService`，被 `common.module.ts` 引入 |
| `apps/api/src/common/interceptors/logging.interceptor.ts` | 请求/响应/错误三阶段拦截器，注入 `requestId`、`method`、`url`、`ip`、`userAgent`、`responseTimeMs`、`statusCode` 等结构化字段 |
| `apps/api/src/common/filters/http-exception.filter.ts` | 全局异常过滤器，5xx 走 `logger.error`（含 stack），4xx 走 `logger.warn`，并通过 `errorEnvelopeFields(request)` 注入 `requestId` |
| `apps/api/src/common/request-id.hook.ts` | Fastify `onRequest` hook，唯一入口处理 `x-request-id` 透传与 ALS 存储 |
| `apps/api/src/database/eventing/outbox-relay.ts` | 后台任务使用 `this.logger.log/warn/error` 记录 outbox relay 生命周期与错误 |
| `apps/api/src/database/mikro/mikro-orm.service.ts` | MikroORM 连接/断开事件通过 `logger.log` 记录 |

## 3. 架构与约定

- **单点抽象**：业务代码不直接 `import pino`，而是通过 `@app/logger/logger.service` 的 `LoggerService`。该服务继承 Nest `Logger`，在 prod 下仍调用 `super.log/error/warn` 以兼容 Nest 控制台输出，同时额外写 pino。
- **全局可用**：`LoggerModule` 标注 `@Global()`，无需显式 import 即可在任何模块中通过 `@Inject(LoggerService)` 注入。
- **双轨消息格式**：所有日志调用遵循「人类可读字符串 + 可选结构化对象」模式。`LoggingInterceptor` 注释明确说明：「人可读消息（首参·保留 `Request [id]` 前缀供回归测）+ pino 结构化字段（次参）」。`LoggerService.log` 会扫描 optionalParams，取第一个 object 作为 meta。
- **请求链路追踪**：`requestIdHook` 是 x-request-id 的唯一入口——优先使用入站 `x-request-id`，否则回退到 Fastify 原生 `req.id`；随后将 id 写回响应头 `x-request-id`，并用 `requestStorage.run({ requestId }, done)` 包裹后续处理链。`LoggingInterceptor` 与 `HttpExceptionFilter` 都通过 `currentRequestId()` 获取该值。
- **IP 与 UA 采集**：`LoggingInterceptor.getClientIp` 按 `x-forwarded-for` → `connection.remoteAddress` → `socket.remoteAddress` → `'unknown'` 顺序取值；`userAgent` 取自 `headers['user-agent']`。
- **异常分级**：`HttpExceptionFilter` 对 `status >= 500` 使用 `logger.error`（附带 `exception.stack`），其余使用 `logger.warn`，避免 4xx 污染 error 通道。
- **审计日志分离**：仓库另有 `libs/core` 中的 `shared-kernel/audit`（见 api-docs 中 `AuditLogEntry` / `AuditLogStore`），与 pino 应用日志分开，用于持久化治理审计。

## 4. 约定与约束

- **日志级别来源**：`process.env.LOG_LEVEL`（默认 `'info'`），`process.env.NODE_ENV` 决定 prod/dev transport 分支，`process.env.LOG_FILE` 覆盖生产日志文件路径。
- **结构化字段约定**：请求级日志必须包含 `requestId`、`method`、`url`；成功响应附加 `responseTimeMs`；错误响应附加 `statusCode`、`trace`（堆栈字符串）。
- **禁止裸 pino**：业务层应通过 `LoggerService`，而非直接 `import pino`；测试中对 `LoggerService` 的 mock 仅暴露 `log`/`error`/`warn` 三个方法（见 `api-contracts.test.ts` 与 `logging.interceptor.test.ts`）。
- **x-request-id 透传不可绕过**：`requestIdHook` 是唯一入口，注释强调「Fastify `onRequest` hook 一处完成三事——定 id、回写响应头、`requestStorage.run` 包住后续全链」，且独立成文件以便单测直调。
- **非 HttpException 的错误不出 message**：`HttpExceptionFilter` 注释明确说明「非 HttpException 的任意 Error …不再把 `exception.message` 赋给响应体——原文常含 SQL 片段、约束名、表列名、连接拓扑，属内部信息泄露」，仅保留在 error 日志中。
- **回归测试依赖日志格式**：`logging.interceptor.test.ts` 断言 `logger.log.mock.calls[0]?.[0]` 包含 `Request [rq-77]` 前缀，因此请求日志的人类可读前缀属于契约性格式，不应随意改动。
- **速率限制墙注释**：`rate-limit.wall.test.ts` 注释指出「logger 现为按 NODE_ENV 选型的 pino 选项对象（dev pretty / prod JSON），不再是布尔 true」，表明 logger 的行为变更已被测试文档化。
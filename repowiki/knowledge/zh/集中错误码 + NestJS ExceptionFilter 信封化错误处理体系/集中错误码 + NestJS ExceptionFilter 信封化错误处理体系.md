---
kind: error_handling
name: 集中错误码 + NestJS ExceptionFilter 信封化错误处理体系
category: error_handling
scope:
    - '**'
source_files:
    - libs/core/src/shared-kernel/errors/error-codes.ts
    - libs/core/src/shared-kernel/errors/error-codes.test.ts
    - apps/api/src/common/filters/http-exception.filter.ts
    - apps/api/src/common/errors/error-envelope-fields.ts
    - apps/api/src/modules/organizations/api/ba-error.mapping.ts
    - packages/api-client/src/errors.ts
    - apps/odoo-rpc-web/src/lib/odoo.ts
---

## 1. 总体方案

仓库采用「集中业务错误码常量 + NestJS `HttpException` + 全局 `ExceptionFilter`」的三层架构：

- **定义层**：`libs/core/src/shared-kernel/errors/error-codes.ts` 以单源 `ERROR_CODES` 对象集中声明所有业务错误码，并导出 TypeScript 联合类型 `ErrorCodeValue`、正则 `ERROR_CODE_PATTERN`（`NAMESPACE:NAME`）与守卫函数 `isErrorCode()`。
- **传播层**：领域/应用服务直接 `throw new ForbiddenException({ message, errorCode })` 等 Nest `HttpException` 子类，把 `errorCode` 作为 object response 字段透传；不引入自定义异常类（注释明确「零新异常类」）。
- **呈现层**：`apps/api/src/common/filters/http-exception.filter.ts` 的全局 `@Catch()` 过滤器统一将异常映射为带 `statusCode/message/error/requestId/timestamp/path` 的标准化信封响应，并把非 `HttpException` 的内部错误消息从响应体剥离以防 SQL/连接信息泄露。
- **消费层**：前端 `packages/api-client/src/errors.ts` 仅 re-export `ERROR_CODES` 与 `isErrorCode`，提供 `ApiError` 包装类与 `hasErrorCode(body, code)` 判别原语，禁止复制码表。

## 2. 关键文件

| 角色 | 路径 |
|---|---|
| 错误码单源 | `libs/core/src/shared-kernel/errors/error-codes.ts` |
| 契约测试 | `libs/core/src/shared-kernel/errors/error-codes.test.ts` |
| HTTP 全局异常过滤器 | `apps/api/src/common/filters/http-exception.filter.ts` |
| 错误信封三字段 helper | `apps/api/src/common/errors/error-envelope-fields.ts` |
| BA 后端错误映射器 | `apps/api/src/modules/organizations/api/ba-error.mapping.ts` |
| 前端 API 错误封装 | `packages/api-client/src/errors.ts` |
| Odoo 客户端错误类 | `apps/odoo-rpc-web/src/lib/odoo.ts`（`OdooFetchError extends Error`） |

## 3. 架构约定

### 3.1 错误码命名与来源纪律

- 所有业务错误码必须通过 `ERROR_CODES.XXX` 引用，禁止在抛错点散落字面量字符串。
- 码值文法为 `NAMESPACE:STABLE_NAME`，命名空间按限界上下文划分：`AUTH / ISOLATION / ORG / ROLE / GRANT / AUTHZ / USER / WORKSPACE / BILLING / STORAGE / MCP`。
- `isErrorCode(value)` 使用 `ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*:[A-Z][A-Z0-9_]*$/` 校验，契约测试双向锁定「码表值 ∈ 该文法」+「抛错点只引用常量」。

### 3.2 抛出方式

- 业务拒绝一律通过 Nest `HttpException` 子类（如 `ForbiddenException`、`BadRequestException`），并以 object response `{ message, errorCode }` 携带错误码。`http-exception.filter.ts` 同时兼容 Nest 原生 `createBody` 注入的 `errorCode` 属性。
- 第三方 BA（Better Auth）返回的错误经 `mapBaError()` 归一：4xx 转为带 `ORG_PROVISIONING_REJECTED` 泛用码的 `HttpException`，5xx/未知错误原样上抛交由全局过滤器处理。

### 3.3 响应信封形状

全局过滤器输出形如：
```json
{
  "statusCode": 403,
  "message": "...",
  "error": "Forbidden",
  "timestamp": "2024-...",
  "path": "/api/...",
  "requestId": "...",
  "errorCode": "AUTH:SESSION_INVALID"
}
```
其中 `timestamp/path/requestId` 由 `errorEnvelopeFields()` 单源生成，`requestId` 来自 ALS 中的 `currentRequestId()`（与日志、MCP 关联 ID 同 id）。

### 3.4 安全约束

- 非 `HttpException` 的任意 `Error`（DB 驱动、PG 连接层等）**不**把 `exception.message` 写入响应体，保持默认 `'Internal server error'`，仅堆栈随 5xx 日志留存——防止 SQL 片段、约束名、连接拓扑泄露。
- `HttpException`（含手动 `InternalServerErrorException(msg)`）走正常分支，因为 `message` 是已编排的安全文本。

### 3.5 前端消费模型

- `ApiError` 保留原始 `body`，暴露 `errorCode` getter；`hasErrorCode(body, code)` 基于共享 `ErrorCodeValue` 类型收窄做分支判断。
- 前端不维护本地错误码表，仅 re-export 共享常量。

## 4. 观察到的约定与约束

- **约定**：业务模块（auth、organizations、authorization、mcp、storage、billing 等）通过 `import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes'` 获取错误码，再以 `throw new ForbiddenException({ message, errorCode: ERROR_CODES.XXX })` 形式抛出。
- **约定**：BA 门面调用统一经 `mapBaError()` 包裹，避免各 handler 各自解析 `APIError.statusCode/status`。
- **约定**：错误码新增必须先加到 `ERROR_CODES`，再在抛错点引用，并由契约测试验证文法。
- **约束**：`isErrorCode()` 的正则 `^[A-Z][A-Z0-9]*:[A-Z][A-Z0-9_]*$` 强制冒号分隔、两段皆大写、第二段允许下划线；该模式由 `error-codes.test.ts` 断言。
- **约束**：全局 `HttpExceptionFilter` 对非 `HttpException` 错误静默丢弃 `message` 字段，这是代码中显式实现的安全边界，而非文档声明。
- **例外**：`packages/api-client/src/errors.ts` 的 `ApiError` 与 `apps/odoo-rpc-web/src/lib/odoo.ts` 的 `OdooFetchError` 是两个自定义 `Error` 子类，但前者仅用于前端包装 oRPC 响应体，后者仅用于 Odoo RPC 演示前端，不属于服务端主流程的异常体系。

## 5. 未覆盖项

- 未发现 `panic/recover` 用法（TypeScript 无 panic）。
- 未发现统一的错误分类枚举或错误基类层次结构（除上述两个前端辅助类外）。
- 未发现针对 oRPC 过程层的独立错误中间件（oRPC 错误经 Fastify REST 适配器后同样走 `HttpExceptionFilter`）。
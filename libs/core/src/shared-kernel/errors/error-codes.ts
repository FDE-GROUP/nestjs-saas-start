/**
 * 业务错误码集中常量（就绪预备 §2.3 #3 · module-global-readiness-error-pagination 切片 A）。
 *
 * @remarks
 * 与 `domain-event-names.ts` 同构的**集中声明纪律**：`errorCode` 是跨前后端（api-client）
 * 的稳定机器标识契约，必须在此单源声明、而非散落字面量；契约测试双向锁定
 * 「码表值 ∈ `NAMESPACE:NAME` 文法」+「抛错点只引用本常量」，防旁逸/漂移。
 *
 * 命名（microservice-readiness §4-② 已锁）：**冒号分段** `NAMESPACE:STABLE_NAME`。
 * - 用冒号而非点分：点分与领域事件名（`user.registered`）相撞，且撞 nestjs-i18n 键语法。
 * - code 是机器标识，与人面可读消息（`message`，随 i18n 翻译）**解耦**——前端据 code 分支、据 message 展示。
 *
 * 命名空间 = 按限界上下文（甲裁）：`AUTH / ISOLATION / ORG / ROLE / GRANT / AUTHZ / USER / WORKSPACE / BILLING / STORAGE / MCP`。
 * 新增码一律先加此处，再在抛错点以 object response 携带（filter 透传·零新异常类）。
 *
 * @public
 */
export const ERROR_CODES = {
  // —— 认证与会话层（SessionGuard / 平台层 session 解析 / BA 装配可用性）——
  AUTH_PROVIDER_UNAVAILABLE: 'AUTH:PROVIDER_UNAVAILABLE',
  AUTH_SESSION_INVALID: 'AUTH:SESSION_INVALID',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH:ACCOUNT_SUSPENDED',
  AUTH_CSRF_ORIGIN_MISMATCH: 'AUTH:CSRF_ORIGIN_MISMATCH',

  // —— 隔离机制（区域 A·global-tenant-isolation-vocabulary：ALS 无活跃上下文 fail-closed 唯一一条）——
  ISOLATION_NO_ACTIVE_CONTEXT: 'ISOLATION:NO_ACTIVE_CONTEXT',

  // —— 组织生命周期状态机 / 治理动作 / 平台经营者（ORG_*）+ 权限裁决拒绝（AUTHZ_*）——
  AUTHZ_PERMISSION_DENIED: 'AUTHZ:PERMISSION_DENIED',
  ORG_OPERATOR_NOT_CONFIGURED: 'ORG:OPERATOR_NOT_CONFIGURED',
  ORG_OPERATOR_ONLY: 'ORG:OPERATOR_ONLY',
  ORG_ILLEGAL_TRANSITION: 'ORG:ILLEGAL_TRANSITION',
  ORG_NOT_PENDING: 'ORG:NOT_PENDING',
  ORG_NOT_DELETED_TERMINAL: 'ORG:NOT_DELETED_TERMINAL',
  ORG_NOT_FOUND: 'ORG:NOT_FOUND',
  ORG_PROVISIONING_NOT_FOUND: 'ORG:PROVISIONING_NOT_FOUND',
  // bind-existing/预检查与库级 unique 共用的公司双射冲突码（一公司只归一组织·module-org-odoo-company-mapping 切片 A·rehierarchy 一组织一公司）。
  ORG_ODOO_BINDING_CONFLICT: 'ORG:ODOO_BINDING_CONFLICT',
  // RPC/SSO 三点门禁的拒答码：无绑定/非 ready/非 active 均此码（fail-closed·切片 B）。
  ORG_ODOO_BINDING_NOT_READY: 'ORG:ODOO_BINDING_NOT_READY',
  // BA 服务端数据事实拒绝的泛用兜底码（4xx·`mapBaError` 出口统一附·细分仍据 HTTP status，
  // 因 BA APIError 仅回不透明 message+status，门面无法可靠辨具体业务语义，不逐态猜码）。
  ORG_PROVISIONING_REJECTED: 'ORG:PROVISIONING_REJECTED',

  // —— X7 租级成员/邀请门面（global-role-membership-tenantization 切片 D·成员/邀请面自 BA passthrough
  //  上收自有租级 SSOT·守卫拒因显式化·沿用 ORG 命名空间不新增）——
  ORG_MEMBER_NOT_FOUND: 'ORG:MEMBER_NOT_FOUND',
  ORG_LAST_OWNER: 'ORG:LAST_OWNER',
  ORG_SELF_REMOVAL: 'ORG:SELF_REMOVAL',
  ORG_INVITATION_NOT_FOUND: 'ORG:INVITATION_NOT_FOUND',
  ORG_INVITATION_DUPLICATE: 'ORG:INVITATION_DUPLICATE',
  ORG_INVITATION_EXPIRED: 'ORG:INVITATION_EXPIRED',

  // —— RBAC 动态角色/授权（ROLE_* / GRANT_*·module-rbac-dynamic-roles S3·自建角色/授权管理门面的领域拒绝码）——
  ROLE_INVALID_KEY: 'ROLE:INVALID_KEY',
  ROLE_DUPLICATE: 'ROLE:DUPLICATE',
  ROLE_NOT_FOUND: 'ROLE:NOT_FOUND',
  ROLE_SYSTEM_PROTECTED: 'ROLE:SYSTEM_PROTECTED',
  GRANT_INVALID_CONDITIONS: 'GRANT:INVALID_CONDITIONS',
  GRANT_DUPLICATE: 'GRANT:DUPLICATE',
  GRANT_NOT_FOUND: 'GRANT:NOT_FOUND',

  // —— 平台用户治理（暂停/恢复状态机 · 用户实体查无）——
  USER_ILLEGAL_TRANSITION: 'USER:ILLEGAL_TRANSITION',
  USER_NOT_FOUND: 'USER:NOT_FOUND',

  // —— 工作区（二级数据分区）——
  WORKSPACE_NOT_FOUND: 'WORKSPACE:NOT_FOUND',

  // —— 计费与配额（席位超限 402 · 支付通道不可用）——
  BILLING_SEAT_LIMIT_EXCEEDED: 'BILLING:SEAT_LIMIT_EXCEEDED',
  BILLING_PROVIDER_NOT_CONFIGURED: 'BILLING:PROVIDER_NOT_CONFIGURED',

  // —— 对象存储（上传前置校验与失败）——
  STORAGE_NOT_MULTIPART: 'STORAGE:NOT_MULTIPART',
  STORAGE_NO_FILE: 'STORAGE:NO_FILE',
  STORAGE_FILE_TOO_LARGE: 'STORAGE:FILE_TOO_LARGE',
  STORAGE_FILE_TYPE_NOT_ALLOWED: 'STORAGE:FILE_TYPE_NOT_ALLOWED',
  STORAGE_UPLOAD_FAILED: 'STORAGE:UPLOAD_FAILED',

  // —— MCP Agent 工具面（module-mcp-agent-surface 切片 1·additive 新组）——
  MCP_CREDENTIAL_NOT_FOUND: 'MCP:CREDENTIAL_NOT_FOUND',
  /** 消费面统一 401（不存在/已撤销/已过期同码防探测·切片 1 校验中间件）。 */
  MCP_CREDENTIAL_INVALID: 'MCP:CREDENTIAL_INVALID',
  /** 凭证有效但属租被封禁（失能联动·沿 TenantStatusService 单源）。 */
  MCP_TENANT_SUSPENDED: 'MCP:TENANT_SUSPENDED',
} as const;

/** 业务错误码值的字面量联合（自 `ERROR_CODES` 派生·`NAMESPACE:NAME` 文法·前后端稳定机器契约）。 @public */
export type ErrorCodeValue = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * `errorCode` 值的文法闸（契约测试与运行时防御共用单一源）：`NAMESPACE:NAME`。
 *
 * @remarks
 * 段名皆大写下划线（`[A-Z]+_[A-Z:]*`）。禁裸串散落抛错点——只能引用本常量。
 *
 * @public
 */
export const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*:[A-Z][A-Z0-9_]*$/;

/**
 * 断言某字符串是合法错误码值（抛错点/测试防御复用）。
 *
 * @param value - 待判定的字符串
 * @returns 是否匹配 `NAMESPACE:NAME` 文法（类型收窄为 `ErrorCodeValue`）
 * @public
 */
export function isErrorCode(value: string): value is ErrorCodeValue {
  return ERROR_CODE_PATTERN.test(value);
}

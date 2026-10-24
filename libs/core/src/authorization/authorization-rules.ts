/**
 * Tenant-level RBAC 词汇表（global-tenancy §9.5.4①B · module-rbac-dynamic-roles §2.1 宪章改写）。
 *
 * 新宪（人裁 2026-10-17·丙《全 DB 化删代码表》）：授权规则矩阵已从代码**整表删净**——
 * **DB 是授权事实 SSOT**（`organization_role`/`organization_role_grant`·行式 grant·热改生效），
 * **代码词汇表是语言 SSOT**（subject/action 编译期保留·`@Can` 类型域·新资源随代码发布入表），
 * **CASL rules 是运行时投影**（app 侧 checker 按租户从 DB grant 行投影）。
 * 旧 `TENANT_RULES` 矩阵已删、内容迁为静态 seed 死数据（app 侧 `constants/system-role-seed.ts`·
 * lazy-ensure 初始化三系统角色），代码侧不再承载任何授权事实。「禁散点特判 / 不实现平行
 * 权限矩阵」条款语义不变（真源从本文件迁到 DB grant 行；module-rbac-casl「表是 SSOT」
 * 旧裁由该片 §4.1 互引订正）。
 *
 * 历史语义注记：`Member/Invitation` 的 `read` = 现状对拍扩项（BA 1.7.7 内置端点仅验
 * isMember·全成员可读），该事实现由 seed 承载，非词汇表职责。词表与 `@Can(action,
 * subject)` 装饰器对齐：subject 用 CASL 惯用 PascalCase 资源名。
 *
 * 纯 TS 零依赖（框架/CASL 均不入本层·architecture 分层矩阵）；本表属 authorization
 * 上下文自有的领域语言（global-contract-placement 判据②：留属主上下文；领域细化
 * 重构自 `tenancy/rbac` 迁居至此，消费方仍含全部业务上下文的 `@Can` 声明）。
 */

/**
 * 租户级角色 = DB 运行时词汇（系统三 key + per-tenant 自定义角色 key）·不再是封闭枚举。
 *
 * @public
 */
export type OrganizationRole = string;

/**
 * 内置系统角色 key（seed 数据输入·is_system=true 不可改不可删；非自定义角色的存在性域）。
 *
 * @public
 */
export const SYSTEM_ROLE_KEYS = ['owner', 'admin', 'member'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

/**
 * 可授权资源词汇表（本表即资源语言 SSOT 唯一源；新增资源先入这里，授权事实入 DB grant 行）。
 *
 * @remarks
 * 运行时数组 + 类型同源（S3 门面 DTO `@IsIn` 需运行时值域·防类型/值双源漂移）。
 *
 * @public
 */
export const AUTHORIZATION_SUBJECT_VALUES = [
  'Organization',
  'Member',
  'Invitation',
  'Workspace',
  'Role',
  'RoleGrant',
] as const;
export type AuthorizationSubject = (typeof AUTHORIZATION_SUBJECT_VALUES)[number];

/**
 * 动作词汇表（与 CASL can(action, subject) 第一元组参一致·运行时数组供 DTO 值域校验）。
 *
 * @public
 */
export const AUTHORIZATION_ACTION_VALUES = [
  'create',
  'read',
  'update',
  'delete',
  'cancel',
] as const;
export type AuthorizationAction = (typeof AUTHORIZATION_ACTION_VALUES)[number];

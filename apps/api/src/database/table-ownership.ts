/**
 * 表所有权纪律·机读单源（microservice-readiness 首切片 #1）。
 *
 * 语义（成文条款见 `docs/specs/architecture.md` 附录）：
 * - **写侧严格**：任何仓储/服务的 `insert/update/delete` 目标表必须属本上下文 owned 集；
 * - **读侧宽松**：跨上下文 select/join 允许（CQRS read-model 固有形态），不受本表约束；
 * - 新表入 owned 集须改本文件并过审计门（本文件是清单 SSOT，文档只写语义不抄清单）。
 *
 * 键为 `schema.ts` 导出名（非物理表名），值为限界上下文标识：
 * `modules/<ctx>/**` 与 `tenancy/**`（归 `tenants`）为守卫扫描的上下文推导源。
 * 领域细化重构定态：RBAC 三表属主已翻账 `authorization`（A 片·守卫 `contextOf` 按
 * `modules/authorization/**` 自动推导）；`platform` 为治理门面上下文·**无自有表**（不在本清单出现）。
 * 机制层提纯（未决项 4·module-tenancy-lifecycle-quota-relocation）：lifecycle 适配归 `modules/tenants/**`
 * （推导仍属 tenants·写侧红牌语义不变）·quota 适配归 `modules/subscriptions/**`（纯读侧·读侧宽松）；
 * `tenancy/**` 现仅剩会话/机制适配，推导源保留防散点。
 */
export const TABLE_OWNERSHIP: Record<string, string> = {
  // auth core：Better Auth adapter 运行时写 + users 注册路径源码写
  user: 'users',
  account: 'auth',
  session: 'auth',
  verification: 'auth',
  consent: 'auth',
  // tenants：审批制生命周期与成员域（BA organization/member/invitation 由本侧服务端 SDK 写）
  organization: 'tenants',
  member: 'tenants',
  invitation: 'tenants',
  userStatus: 'tenants',
  // global-tenant-entity-reclamation 切片 A：租户户籍自有表（旁表 id=organization.id 同值）
  tenant: 'tenants',
  // 各业务上下文
  workspace: 'workspaces',
  post: 'posts',
  tenantSubscription: 'subscriptions',
  // module-rbac-dynamic-roles S1（甲裁三表）·领域细化重构后属 `authorization` 上下文：
  // 角色/授权/审计均属授权域自有表，唯一写通道 = MikroTenantRbacRepository（门面皆经端口读写，禁散点直访）。
  tenantRole: 'authorization',
  tenantRoleGrant: 'authorization',
  tenantRoleAudit: 'authorization',
  // database 基础设施：ES 端口（原事件存储适配）独占写面，业务仓储不得直写 event（§6-丙）
  event: 'database',
};

/**
 * 显式声明的写侧例外（可审、可数、有归因——替代逐模块特判的暗账）。
 * 新增例外必须过审计门并在 plan 留痕。
 */
export interface WriteException {
  /** 相对 `apps/api/src` 的文件路径。 */
  readonly file: string;
  /** 被跨写的表（schema 导出名）。 */
  readonly table: string;
  /** 归因说明。 */
  readonly reason: string;
}

export const WRITE_EXCEPTIONS: readonly WriteException[] = [
  // 架构精度修宪 S3 后例外清零：suspend 治理失权链的 session 硬删已收编
  // `modules/auth/infrastructure/session-store.adapter.ts`（AUTH_SESSION_STORE 端口·属主
  // auth 上下文目录内写·守卫自然放行）——原 suspend-user 直捅例外随之摘除。
];

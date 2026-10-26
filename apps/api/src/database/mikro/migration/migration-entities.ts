import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import { defineEntity, p } from '@mikro-orm/core';
import {
  TENANT_ROLE_AUDIT_META,
  TENANT_ROLE_GRANT_META,
  TENANT_ROLE_META,
} from '../../../modules/authorization/infrastructure/entities/rbac.entities';
import { AUDIT_LOG_META } from '../../../modules/organizations/infrastructure/entities/audit-log.entity';
import { TENANT_META } from '../../../modules/organizations/infrastructure/entities/tenant.entity';
import { TENANT_SUBSCRIPTION_META } from '../../../modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { WORKSPACE_META } from '../../../modules/workspaces/infrastructure/entities/workspace.entity';
import { EVENT_META } from '../../eventing/entities/event.entity';
import { buildMigrationEntity } from '../column-meta';

/**
 * ORM 修宪案 B · 切片 3a —— **迁移专用·忠实全模型** 实体集（MikroORM v7 零装饰器 `defineEntity`）。
 *
 * 定位（归人裁定·多租户优先）：本文件**只服务 schema 迁移基线**，与两处刻意「扁平/有损」的实体集**解耦**——
 *  - BA 运行时面（归域两文件：auth `ba-identity.entities.ts` + tenants `ba-org.entities.ts`·为 `mikro-auth-adapter` 的 **raw SQL** 寻址服务）：
 *    扁平标量列、不建关系对象（遵循 BA `createAdapterFactory` 契约）；本迁移集**不触碰、不导入**它。
 *  - `modules/posts/infrastructure/entities/post.entity.ts`（切片 2·app 试迁移面）：同上。
 *  三套各自独立装进各自的 `MikroORM.init`（本集见 `mikro-migration.config.ts`），**零交集** ⇒ 切片 1/2 的
 *  一致性套件与默认 CI 基线不受本文件任何影响（爆炸半径隔离）。
 *
 * 为何「忠实」——迁移基线 = Mikro 生成器据**实体元数据**反推 DDL；若元数据丢失 FK/索引/列，Mikro 一旦接管
 * 未来 DDL 就会**静默 DROP** 这些约束。多租户命脉（NFR-6 租户级联删除、S2/S3 租户作用域读索引）全在
 * FK cascade + 复合索引里，故本集**逐列对齐** `database/schema.ts`（现生产表面）：
 *  - 类型映射（实测钉死·见下）：`text`→`p.text()`；`timestamp`(无 tz)→`p.datetime().columnType('timestamp')`
 *    （Mikro 默认 `p.datetime()` 会发 `timestamptz`，与旧实现 `.columnType` 缺省 `timestamp` 不符，须显式压回）；
 *    `integer`→`p.integer()`；`boolean`→`p.boolean()`；`jsonb`→`p.json()`；`bigserial`→`p.bigint('number').autoincrement()`；
 *    `pgEnum('role')`→`p.enum([...]).nativeEnumName('role')`；`DEFAULT now()`→`.defaultRaw('now()')`；
 *    app 级 `$onUpdate` 的 `updatedAt` **无 DB 默认**（旧 ORM 亦然），故仅 NOT NULL、不挂 default。
 *  - 跨模型外键用 `p.manyToOne(T).mapToPk().deleteRule(...)`——`mapToPk` 令列仍存**裸 FK 值**（贴合 adapter
 *    的扁平读写习惯），同时让生成器发出带 `on delete cascade / set null` 的 FK 约束（Postgres 不为 FK 自动建索引，
 *    与旧实现 一致，无多余索引漂移）。
 *  - 索引/唯一以**实体级 `indexes`/`uniques` + 显式 name** 复刻 schema.ts 的 `index/uniqueIndex/unique` 名与列集。
 *
 * 本集**不含** companion instance interface：实体从不被 app 代码实例化，仅作为 `MikroORM.init` 的 schema 元数据。
 *
 * ⚠ 本切片仅生成/对拍 init 迁移工件，**不对常驻 dev/生产库执行 `migrator.up()`**（真库应用＝高危清单 1·须人一次性签核）。
 */

const ts = () => p.datetime().columnType('timestamp');
const tsNow = () => p.datetime().columnType('timestamp').defaultRaw('now()');

export const User = defineEntity({
  name: 'User',
  tableName: 'user',
  properties: {
    id: p.text().primary(),
    name: p.text(),
    email: p.text(),
    emailVerified: p.boolean().default(false),
    image: p.text().nullable(),
    isOwner: p.boolean().default(false),
    handle: p.text().default(''),
    password: p.text().nullable(),
    firstName: p.text().nullable(),
    lastName: p.text().nullable(),
    role: p
      .enum(['USER', 'ADMIN'] as const)
      .nativeEnumName('role')
      .default('USER'),
    // global-governance-lifecycle-consolidation 切片 C：用户治理生命周期态归 user 真列
    //（原 `user_status` 旁表 DROP）·NOT NULL DEFAULT 'active'（缺席态消失·deny-list 兑底转真列）。
    status: p.text().default(TENANCY_STATUS.ACTIVE),
    statusReason: p.text().nullable(),
    createdAt: tsNow(),
    updatedAt: ts(),
  },
  uniques: [{ name: 'user_email_idx', properties: ['email'] }],
  // 值域 = USER_STATUS 三态子集（active/suspended/deleted）·与运行时 ba-identity.entities 同表达式。
  checks: [
    {
      name: 'user_status_check',
      expression: `status IN (${[
        TENANCY_STATUS.ACTIVE,
        TENANCY_STATUS.SUSPENDED,
        TENANCY_STATUS.DELETED,
      ]
        .map((v) => `'${v}'`)
        .join(', ')})`,
    },
  ],
});

export const Account = defineEntity({
  name: 'Account',
  tableName: 'account',
  properties: {
    id: p.text().primary(),
    accountId: p.text(),
    providerId: p.text(),
    userId: p.manyToOne(User).mapToPk().deleteRule('cascade'),
    accessToken: p.text().nullable(),
    refreshToken: p.text().nullable(),
    idToken: p.text().nullable(),
    accessTokenExpiresAt: ts().nullable(),
    refreshTokenExpiresAt: ts().nullable(),
    scope: p.text().nullable(),
    password: p.text().nullable(),
    createdAt: tsNow(),
    updatedAt: ts(),
  },
});

export const Session = defineEntity({
  name: 'Session',
  tableName: 'session',
  properties: {
    id: p.text().primary(),
    expiresAt: ts(),
    token: p.text(),
    userId: p.manyToOne(User).mapToPk().deleteRule('cascade'),
    provider: p.text().nullable(),
    activeOrganizationId: p.text().nullable(),
    ipAddress: p.text().nullable(),
    userAgent: p.text().nullable(),
    createdAt: tsNow(),
    updatedAt: ts(),
  },
  // module-session-index-and-expiry-reclaim F1（高危#1·人「同意 GO·亲签迁移」2026-10-20）：
  // BA 服务端每请求按 token 查 session 旧无索引→全表 seq scan；`user_email_idx`/`member_org_user_idx`
  // 已证 BA 契约表可带具名 unique 约束（列律只裁表名恒等·不裁索引）。采 uniques 与既有形态一致
  // （产具名 unique 约束·planner 自动建 backing 唯一索引命中查询·兼完整性防线）；expiresAt 普通索供回收。
  uniques: [{ name: 'session_token_idx', properties: ['token'] }],
  indexes: [{ name: 'session_expires_at_idx', properties: ['expiresAt'] }],
});

export const Verification = defineEntity({
  name: 'Verification',
  tableName: 'verification',
  properties: {
    id: p.text().primary(),
    identifier: p.text(),
    value: p.text(),
    expiresAt: ts(),
    createdAt: tsNow(),
    updatedAt: ts(),
  },
});

// rehierarchy 切片 B：新层根表（无 FK 依赖·须先于 Organization 求值——各表 tenantId 列在此引用）。
export const Tenant = buildMigrationEntity(TENANT_META, {});

export const Organization = defineEntity({
  name: 'Organization',
  tableName: 'organization',
  properties: {
    id: p.text().primary(),
    // 归属租户（global-tenant-organization-rehierarchy 切片 B·expand 段 nullable·FK cascade）：
    // 新层级 Tenant ⊃ Organization ⊃ Workspace 的边——本表现系租户域内业务表（切片 C registry 闸换轴随动）。
    tenantId: p.manyToOne(Tenant).mapToPk().deleteRule('cascade').nullable(),
    name: p.text(),
    slug: p.text(),
    logo: p.text().nullable(),
    createdAt: tsNow(),
    // schema.ts：organization.updatedAt 无 .notNull() ⇒ 可空（与其它表不同·忠实复刻）
    updatedAt: ts().nullable(),
    metadata: p.json<Record<string, any>>().nullable(),
    // global-governance-lifecycle-consolidation 切片 B：租户治理生命周期态归 organization 真列
    //（原 `tenant` 旁表 DROP）·NOT NULL DEFAULT 'active'（缺席态消失·堵 O1）。
    status: p.text().default(TENANCY_STATUS.ACTIVE),
    // —— Odoo 公司绑定列组（module-org-odoo-company-mapping 切片 A）：与运行时 `ba-org.entities.ts`
    // 同列集同式（本集不导入运行时实体，双写漂移由 generate 非空 diff + gated e2e 库语义测捕获）。
    // 公司 id 为跨库弱引用列（无 FK）；unique=一组织一公司双射的库级兜底。
    odooCompanyId: p.integer().nullable().unique(),
    odooBindingStatus: p.text().nullable(),
    odooCompanyName: p.text().nullable(),
    odooBoundAt: p.datetime().columnType('timestamp').nullable(),
    odooFailureReason: p.text().nullable(),
  },
  uniques: [{ name: 'organization_odooCompanyId_unique', properties: ['odooCompanyId'] }],
  // 值域自 `TENANCY_STATUS`/`ORGANIZATION_ODOO_BINDING_STATUS` 单源生成·与运行时
  // ba-org.entities 同表达式（枚举漂移由下次 generate 非空 diff 捕获）。
  checks: [
    {
      name: 'organization_status_check',
      expression: `status IN (${Object.values(TENANCY_STATUS)
        .map((v) => `'${v}'`)
        .join(', ')})`,
    },
    {
      name: 'organization_odoo_binding_status_check',
      // 列名必引号：驼峰列经 EntityCaseNamingStrategy 实存为 "odooBindingStatus"，裸写会被 PG
      // 折叠小写致 apply 时 errorMissingColumn（沿基线 `"tenant_status_check"` 引号先例）。
      expression: `"odooBindingStatus" IN (${Object.values(ORGANIZATION_ODOO_BINDING_STATUS)
        .map((v) => `'${v}'`)
        .join(', ')})`,
    },
  ],
});

export const Member = defineEntity({
  name: 'Member',
  tableName: 'member',
  properties: {
    id: p.text().primary(),
    // 片二 K3 收口：expand 段冗余 `tenantId` 列已退役 DROP（租级归属读经 organization.tenantId 派生）。
    organizationId: p.manyToOne(Organization).mapToPk().deleteRule('cascade'),
    userId: p.manyToOne(User).mapToPk().deleteRule('cascade'),
    role: p.text().default('member'),
    createdAt: tsNow(),
  },
  uniques: [{ name: 'member_org_user_idx', properties: ['organizationId', 'userId'] }],
});

export const Invitation = defineEntity({
  name: 'Invitation',
  tableName: 'invitation',
  properties: {
    id: p.text().primary(),
    // 片二 K3 收口：expand 段冗余 `tenantId` 列已退役 DROP（同 member·目标租户经 organization.tenantId 派生）。
    organizationId: p.manyToOne(Organization).mapToPk().deleteRule('cascade'),
    email: p.text(),
    role: p.text(),
    status: p.text().default('pending'),
    expiresAt: ts(),
    inviterId: p.manyToOne(User).mapToPk().deleteRule('cascade'),
    createdAt: tsNow(),
  },
  indexes: [{ name: 'invitation_org_email_idx', properties: ['organizationId', 'email'] }],
});

export const Workspace = buildMigrationEntity(WORKSPACE_META, { User, Organization, Tenant });

export const Consent = defineEntity({
  name: 'Consent',
  tableName: 'consent',
  properties: {
    id: p.text().primary(),
    userId: p.manyToOne(User).mapToPk().nullable().deleteRule('set null'),
    purpose: p.text(),
    version: p.text(),
    grantedAt: tsNow(),
    revokedAt: ts().nullable(),
    evidence: p.text().nullable(),
    createdAt: tsNow(),
    updatedAt: ts(),
  },
  indexes: [{ name: 'consent_user_purpose_idx', properties: ['userId', 'purpose'] }],
});

export const Post = defineEntity({
  name: 'Post',
  tableName: 'post',
  properties: {
    id: p.text().primary(),
    title: p.text(),
    content: p.text().nullable(),
    published: p.boolean().default(false),
    tenantId: p.manyToOne(Tenant).mapToPk().deleteRule('cascade').nullable(),
    organizationId: p.manyToOne(Organization).mapToPk().deleteRule('cascade'),
    workspaceId: p.manyToOne(Workspace).mapToPk().nullable().deleteRule('set null'),
    createdAt: tsNow(),
    updatedAt: ts(),
  },
  indexes: [
    { name: 'post_organization_created_idx', properties: ['organizationId', 'createdAt'] },
    { name: 'post_organization_workspace_idx', properties: ['organizationId', 'workspaceId'] },
  ],
});

// rehierarchy 片二 K2：旧 `organization_subscription` 实体已随 contract 段退役（表物理 DROP·见 drop 迁移）。
// 计费上移新表（META 双形单源入基线集供 generate 非空 diff 对拍）。
export const TenantSubscription = buildMigrationEntity(TENANT_SUBSCRIPTION_META, {
  User,
  Tenant,
});

export const Event = buildMigrationEntity(EVENT_META, { User, Organization });

// module-rbac-dynamic-roles S1（甲裁三表）：授权事实 SSOT 入 DB·同元数据双变体派生（纯 additive）。
export const TenantRole = buildMigrationEntity(TENANT_ROLE_META, {
  Organization,
  Tenant,
});
export const TenantRoleGrant = buildMigrationEntity(TENANT_ROLE_GRANT_META, {
  TenantRole,
});
export const TenantRoleAudit = buildMigrationEntity(TENANT_ROLE_AUDIT_META, {
  Organization,
  Tenant,
  User,
});

// global-governance-lifecycle-consolidation 切片 E：治理审计耐久账本（append-only·同元数据双变体派生·纯 additive）。
export const AuditLog = buildMigrationEntity(AUDIT_LOG_META, { User });

/** 迁移基线用的全表忠实实体集（17 表·与实体元数据逐列对齐·rehierarchy 片二 K2 旧 `organization_subscription` 退役后 18→17）。 */
export const MIKRO_MIGRATION_ENTITIES = [
  User,
  Account,
  Session,
  Verification,
  Tenant,
  Organization,
  Member,
  Invitation,
  Workspace,
  Consent,
  Post,
  TenantSubscription,
  Event,
  TenantRole,
  TenantRoleGrant,
  TenantRoleAudit,
  AuditLog,
];

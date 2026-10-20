import { defineEntity, p } from '@mikro-orm/core';
import {
  TENANT_ROLE_AUDIT_META,
  TENANT_ROLE_GRANT_META,
  TENANT_ROLE_META,
} from '../../../modules/authorization/infrastructure/entities/rbac.entities';
import { TENANT_SUBSCRIPTION_META } from '../../../modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { TENANT_META } from '../../../modules/tenants/infrastructure/entities/tenant.entity';
import { USER_STATUS_META } from '../../../modules/tenants/infrastructure/entities/user-status.entity';
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
    createdAt: tsNow(),
    updatedAt: ts(),
  },
  uniques: [{ name: 'user_email_idx', properties: ['email'] }],
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

export const Organization = defineEntity({
  name: 'Organization',
  tableName: 'organization',
  properties: {
    id: p.text().primary(),
    name: p.text(),
    slug: p.text(),
    logo: p.text().nullable(),
    createdAt: tsNow(),
    // schema.ts：organization.updatedAt 无 .notNull() ⇒ 可空（与其它表不同·忠实复刻）
    updatedAt: ts().nullable(),
    metadata: p.json<Record<string, any>>().nullable(),
  },
});

export const Member = defineEntity({
  name: 'Member',
  tableName: 'member',
  properties: {
    id: p.text().primary(),
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

export const Workspace = buildMigrationEntity(WORKSPACE_META, { User, Organization });

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

export const UserStatus = buildMigrationEntity(USER_STATUS_META, { User, Organization });

export const TenantSubscription = buildMigrationEntity(TENANT_SUBSCRIPTION_META, {
  User,
  Organization,
});

export const Event = buildMigrationEntity(EVENT_META, { User, Organization });

// module-rbac-dynamic-roles S1（甲裁三表）：授权事实 SSOT 入 DB·同元数据双变体派生（纯 additive）。
export const TenantRole = buildMigrationEntity(TENANT_ROLE_META, { Organization });
export const TenantRoleGrant = buildMigrationEntity(TENANT_ROLE_GRANT_META, { TenantRole });
export const TenantRoleAudit = buildMigrationEntity(TENANT_ROLE_AUDIT_META, {
  Organization,
  User,
});

// global-tenant-entity-reclamation 切片 A：租户户籍自有表（旁表同值 PK·status 真列+CHECK）。
export const Tenant = buildMigrationEntity(TENANT_META, { Organization });

/** 迁移基线用的全表忠实实体集（17 表·与 schema 逐列对齐）。 */
export const MIKRO_MIGRATION_ENTITIES = [
  User,
  Account,
  Session,
  Verification,
  Organization,
  Member,
  Invitation,
  Workspace,
  Consent,
  Post,
  UserStatus,
  TenantSubscription,
  Event,
  TenantRole,
  TenantRoleGrant,
  TenantRoleAudit,
  Tenant,
];

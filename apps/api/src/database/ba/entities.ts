import { defineEntity, p } from '@mikro-orm/core';

/**
 * ORM 修宪案 B · 切片 1 —— Better Auth 表面实体的 **零装饰器** 定义（MikroORM v7 `defineEntity`）。
 *
 * 形态（依 plan §5 Q2 裁决）：采零装饰器 + `defineEntity`/`p` 构造器，S9 三重约束在 ORM 实体面**不适用**
 * （实体非 DI 目标，无 `design:paramtypes` 之虞）。字段一律**扁平标量列**：跨模型外键当普通 string 列存
 * （不建 Mikro 关系对象——BA adapter 以「模型名 → entity」映射逐表寻址，不依赖 ORM 级 relation 装配）。
 * 列名走 **`EntityCaseNamingStrategy`**（见 orm.ts）：属性名**原样**作列名（camelCase 列，SQL 中一律双引号限定），
 * 使 BA 侧 DB 字段名（camelCase）与物理列名**直接对齐**——adapter 以手写 SQL（`em.execute`）寻址时键名两侧一致。
 * 表名单词小写与 BA 模型名对齐（`user`/`account`/…）。
 *
 * 字段集与 `apps/api/src/database/schema.ts`（现生产表面）逐列对齐，另加 `dateField`
 * （供 `@better-auth/test-utils` authFlow 的 additional-fields 一致性用例往返 Date）。
 *
 * 本目录在切片 1 **未接入生产装配**；切片 3 已换接链并接入生产。
 *
 * **身份（global-ba-contract-surface）**：本文件是 **Better Auth 契约面存储视图**，非领域模型——列形权威在
 * BA 上游（字段集与其 schema 逐列对齐），表属主台账见 `table-ownership.ts`（跨 users/auth/tenants 三属主）。
 * 按表属主拆分会割裂单一契约单位（上游变更永远整组动），如需重议先翻本条与台账。历史：自 `mikro/entities.ts` 迁至 `database/ba/`。
 */

export const User = defineEntity({
  name: 'User',
  tableName: 'user',
  properties: {
    id: p.string().primary(),
    name: p.string(),
    email: p.string(),
    emailVerified: p.boolean(),
    image: p.string().nullable(),
    // BA user additionalFields（auth.implement.ts：isOwner / handle）——本 Mikro 表面仅承载「BA core 会写入的列」，
    // authFlow 一致性用例走 harness 默认 options（不含本仓 additionalFields），故 isOwner 走 DB 默认、handle 可空，
    // 避免 core signUp 未带这两列时触发 NOT NULL。生产接链面（切片 3）以真实 additionalFields 覆盖。
    isOwner: p.boolean().default(false),
    handle: p.string().nullable(),
    // 业务字段（本地邮箱注册面）
    password: p.string().nullable(),
    firstName: p.string().nullable(),
    lastName: p.string().nullable(),
    // 业务字段 `role`（schema.ts `roleEnum` 列 NOT NULL default 'USER'）——ORM 修宪案 B 切片 3d（S-d1）
    // 为 `MikroUserRepository` 读写用户聚合所需。声明带 `.default('USER')` 沿 isOwner/handle 惯例：既让
    // 一致性套件（BA core signUp 不写 role）经 DB 默认落值、又不干扰 Mikro 轨写入显式 role 文本（PG 将
    // 'USER'/'ADMIN' 文本 coerced 入 enum 列）。仅运行时 app-orm 面消费，不参与迁移 DDL 生成（忠实全模型另在 migration-entities）。
    role: p.string().default('USER'),
    // test-utils additional-fields 一致性用例（type:'date'）
    dateField: p.datetime().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Account = defineEntity({
  name: 'Account',
  tableName: 'account',
  properties: {
    id: p.string().primary(),
    accountId: p.string(),
    providerId: p.string(),
    userId: p.string(),
    accessToken: p.string().nullable(),
    refreshToken: p.string().nullable(),
    idToken: p.string().nullable(),
    accessTokenExpiresAt: p.datetime().nullable(),
    refreshTokenExpiresAt: p.datetime().nullable(),
    scope: p.string().nullable(),
    password: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Session = defineEntity({
  name: 'Session',
  tableName: 'session',
  properties: {
    id: p.string().primary(),
    expiresAt: p.datetime(),
    token: p.string(),
    userId: p.string(),
    // session additionalFields（provider / activeOrganizationId / ipAddress / userAgent）
    provider: p.string().nullable(),
    activeOrganizationId: p.string().nullable(),
    ipAddress: p.string().nullable(),
    userAgent: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Verification = defineEntity({
  name: 'Verification',
  tableName: 'verification',
  properties: {
    id: p.string().primary(),
    identifier: p.string(),
    value: p.string(),
    expiresAt: p.datetime(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Organization = defineEntity({
  name: 'Organization',
  tableName: 'organization',
  properties: {
    id: p.string().primary(),
    name: p.string(),
    slug: p.string(),
    logo: p.string().nullable(),
    metadata: p.json<Record<string, any>>().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Member = defineEntity({
  name: 'Member',
  tableName: 'member',
  properties: {
    id: p.string().primary(),
    organizationId: p.string(),
    userId: p.string(),
    role: p.string(),
    createdAt: p.datetime(),
  },
});

export const Invitation = defineEntity({
  name: 'Invitation',
  tableName: 'invitation',
  properties: {
    id: p.string().primary(),
    organizationId: p.string(),
    email: p.string(),
    role: p.string(),
    status: p.string(),
    expiresAt: p.datetime(),
    inviterId: p.string(),
    createdAt: p.datetime(),
  },
});

/**
 * PIPL 同意台账（C1 · FR-7/D7）——与 `schema.ts` 的 `consent` 表逐列对齐（列名 camelCase 走
 * `EntityCaseNamingStrategy`）。ORM 修宪案 B 切片 3d（S-d4）为 `ExportUserDataQueryHandler` 的只读
 * 投影补入运行时 app-orm；`evidence`（IP/UA 审计料）属导出应排除的凭据面，实体保留列但读面靠 `fields` 投影剔除。
 */
export const Consent = defineEntity({
  name: 'Consent',
  tableName: 'consent',
  properties: {
    id: p.string().primary(),
    userId: p.string().nullable(),
    purpose: p.string(),
    version: p.string(),
    grantedAt: p.datetime(),
    revokedAt: p.datetime().nullable(),
    evidence: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const MIKRO_ENTITIES = [
  User,
  Account,
  Session,
  Verification,
  Organization,
  Member,
  Invitation,
  // PIPL 同意台账（schema.ts `consent` 表·C1/FR-7）——切片 3d（S-d4 用户数据导出读面）补入运行时
  // app-orm。BA 核心 adapter 不路由该模型，仅供 `em.find(Consent, …, {fields})` 只读投影。
  Consent,
];

import { defineEntity, p } from '@mikro-orm/core';

/**
 * Better Auth 身份机器族实体（global-ba-entity-domain-placement 切片 A · 人裁 2026-10-20：
 * 「库约束接口·域拥有事实」——BA 为 auth 域工具，本族表归 **auth 域**）。
 *
 * 形状受 **BA 接口契约约束**（列律 `BA_CONTRACT_TABLES` 登账·改列=违契约；上游变更沿认证机器族演进，
 * 落点即本文件）。形态沿 ORM 修宪案 B 切片 1 裁决：零装饰器 `defineEntity`/`p`；字段一律扁平标量列
 * （跨模型外键当普通 string 列·不建 Mikro 关系对象——BA adapter 以 raw SQL 模型名寻址，不依赖
 * relation 装配）；列名走 `EntityCaseNamingStrategy`（属性名原样作列名·camelCase 与 BA 字段直接对齐）。
 * 历史自 `database/ba/entities.ts` 迁入（该文件经 global-ba-contract-surface 成区·本案再裁决归域）。
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

/**
 * PIPL 同意台账（C1 · FR-7/D7）——与 `schema.ts` 的 `consent` 表逐列对齐（列名 camelCase 走
 * `EntityCaseNamingStrategy`）。ORM 修宪案 B 切片 3d（S-d4）为 `ExportUserDataQueryHandler` 的只读
 * 投影补入运行时 app-orm；`evidence`（IP/UA 审计料）属导出应排除的凭据面，实体保留列但读面靠 `fields` 投影剔除。
 * （归位案裁②：Consent 跟身份机器族归 auth——与验证机器同族。）
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

/** 身份机器族实体集（BA 契约面八表之子集·运行时装配经 `MIKRO_ENTITIES` 聚合）。 */
export const MIKRO_IDENTITY_ENTITIES = [User, Account, Session, Verification, Consent];

import { defineEntity, p } from '@mikro-orm/core';

/**
 * Better Auth 组织容器族实体（global-ba-entity-domain-placement 切片 B · 人裁 2026-10-20：
 * 「库约束接口·域拥有事实」——BA 为 auth 域工具，本族表归 **tenants 域**）。
 *
 * 形状受 **BA 接口契约约束**（列律 `BA_CONTRACT_TABLES` 登账·改列=违契约；上游变更随 BA org
 * 插件族演进，落点即本文件）。操作面走 BA `auth.api.*` 工具面（**拥有表 ≠ 接管操作**——
 * 成员/邀请机器不重实现）。形态沿 ORM 修宪案 B 切片 1 裁决：零装饰器 `defineEntity`/`p`·
 * 扁平标量列·`EntityCaseNamingStrategy`（camelCase 属性名原样作列名·与 BA 字段直接对齐）。
 * 历史自 `database/ba/entities.ts` 迁入（经 global-ba-contract-surface 成区·本案再裁决归域·
 * ba/ 区随本片消解）。
 */

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

/** 组织容器族实体集（BA 契约面八表之子集·运行时装配经装配根 `MIKRO_ENTITIES` 聚合）。 */
export const MIKRO_ORG_ENTITIES = [Organization, Member, Invitation];

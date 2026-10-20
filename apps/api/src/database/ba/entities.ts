import { defineEntity, p } from '@mikro-orm/core';
// global-ba-entity-domain-placement 切片 A：身份机器族五实体（User/Account/Session/Verification/
// Consent）已迁 auth 域 `modules/auth/infrastructure/entities/ba-identity.entities.ts`（本案裁①②）。
// 本文件暂存**组织容器族**三实体（切片 B 迁 tenants 后本文件消解）；`MIKRO_ENTITIES` 聚合为
// 装配根性质（database→modules 方向合法·同 `app-entities.ts` 惯例）。
import { MIKRO_IDENTITY_ENTITIES } from '../../modules/auth/infrastructure/entities/ba-identity.entities';

/**
 * Better Auth 组织容器族实体（形状受 BA 接口契约约束·随 org 插件族演进）——暂存待切片 B 迁
 * `modules/tenants/infrastructure/entities/`。形态与历史注记见 ba-identity.entities.ts 头注。
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

/** BA 契约面八表全集（身份机器族[auth·切片 A 已迁] + 组织容器族[暂存·切片 B 迁]·装配根聚合）。 */
export const MIKRO_ENTITIES = [...MIKRO_IDENTITY_ENTITIES, Organization, Member, Invitation];

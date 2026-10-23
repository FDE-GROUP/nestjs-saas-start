import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { defineEntity, p } from '@mikro-orm/core';

/**
 * Better Auth 组织容器族实体（global-ba-entity-domain-placement 切片 B · 人裁 2026-10-20：
 * 「库约束接口·域拥有事实」——BA 为 auth 域工具，本族表归 **tenants 域**）。
 *
 * 形状受 **BA 接口契约约束**（列律 `BA_CONTRACT_TABLES` 登账）。按 global-governance-lifecycle-
 * consolidation 修宪（人裁 2026-10-23）：BA 表**非专用·系共享表**——本域可按需 additive 增自撰域列，
 * 优先数据建模范式合理性；红线仅为「不删/不改 BA 约定字段及其数据类型」。`Organization.status` 即
 * 此类自撰域列（租户治理生命周期态归真列·原 `tenant` 旁表随本案 DROP），对 `mikro-auth-adapter` raw SQL
 * 寻址的 BA 必需列为纯 additive·零冲突。上游变更随 BA org 插件族演进，落点即本文件。操作面走 BA
 * `auth.api.*` 工具面（**拥有表 ≠ 接管操作**——成员/邀请机器不重实现）。形态沿 ORM 修宪案 B 切片 1 裁决：
 * 零装饰器 `defineEntity`/`p`·扁平标量列·`EntityCaseNamingStrategy`（camelCase 属性名原样作列名·与 BA 字段
 * 直接对齐）。历史自 `database/ba/entities.ts` 迁入（经 global-ba-contract-surface 成区·本案再裁决归域·
 * ba/ 区随本片消解）。
 */

/** 值域 = `ORGANIZATION_STATUS` 声明序单源（与迁移工件 `organization_status_check` 同表达式·枚举漂移由下次 generate 非空 diff 捕获）。 */
const STATUS_CHECK_EXPRESSION = `status IN (${Object.values(ORGANIZATION_STATUS)
  .map((v) => `'${v}'`)
  .join(', ')})`;

export const Organization = defineEntity({
  name: 'Organization',
  tableName: 'organization',
  properties: {
    id: p.string().primary(),
    name: p.string(),
    slug: p.string(),
    logo: p.string().nullable(),
    metadata: p.json<Record<string, any>>().nullable(),
    // 租户治理生命周期态（global-governance-lifecycle-consolidation 切片 B·原 tenant.status 旁列归位）：
    // NOT NULL DEFAULT 'active'——缺席态消失（堵 O1 fail-open），BA 系统动作直建 org（seed/内部）落 'active'，
    // 自助建租经 provisioning.submit 显式覆写 'pending_approval'（S4 审批制）。
    status: p.string().default(ORGANIZATION_STATUS.ACTIVE),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
  checks: [{ name: 'organization_status_check', expression: STATUS_CHECK_EXPRESSION }],
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

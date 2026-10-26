import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
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

/** 绑定态值域 = `ORGANIZATION_ODOO_BINDING_STATUS` 声明序单源（同上漂移闸；NULL=未绑定，CHECK 对 NULL 恒通过·不越「列缺席」语义）。列名必引号：驼峰列实存带引号，裸写会被 PG 折叠小写（errorMissingColumn）。 */
const BINDING_STATUS_CHECK_EXPRESSION = `"odooBindingStatus" IN (${Object.values(
  ORGANIZATION_ODOO_BINDING_STATUS,
)
  .map((v) => `'${v}'`)
  .join(', ')})`;

export const Organization = defineEntity({
  name: 'Organization',
  tableName: 'organization',
  properties: {
    id: p.string().primary(),
    // 归属租户（global-tenant-organization-rehierarchy 切片 B·expand 段 nullable·自撰域列受列律约束，
    // BA 契约列零触碰）：新层级 Tenant ⊃ Organization 的边；回填后全量有值，NOT NULL 收紧留 contract 段。
    tenantId: p.string().nullable(),
    name: p.string(),
    slug: p.string(),
    logo: p.string().nullable(),
    metadata: p.json<Record<string, any>>().nullable(),
    // 租户治理生命周期态（global-governance-lifecycle-consolidation 切片 B·原 tenant.status 旁列归位）：
    // NOT NULL DEFAULT 'active'——缺席态消失（堵 O1 fail-open），BA 系统动作直建 org（seed/内部）落 'active'，
    // 自助建租经 provisioning.submit 显式覆写 'pending_approval'（S4 审批制）。
    status: p.string().default(ORGANIZATION_STATUS.ACTIVE),
    // —— Odoo 公司绑定列组（module-org-odoo-company-mapping 切片 A·自撰域列·同 `status` 受列律 L1/L2 约束）：
    // 双库物理隔离下的平行映射载体（vision v0.10.0 §4.8/§6）；`odooCompanyId` 唯一=一组织一公司
    // 双射的库级兜底（应用层预检查前置，本约束是并发竞争终防线）；公司 id 为跨库弱引用列，无 FK。
    odooCompanyId: p.integer().nullable().unique(),
    // 值域词汇仅在应用层持型（`p.string()` 不支持泛型参数·同 `status` 列裸 text 先例），
    // CHECK 约束守住库级值域。
    odooBindingStatus: p.string().nullable(),
    /** 公司名快照（denormalize·provisioning/doctor 刷新·不做实时跨库拼装）。 */
    odooCompanyName: p.string().nullable(),
    odooBoundAt: p.datetime().nullable(),
    odooFailureReason: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
  checks: [
    { name: 'organization_status_check', expression: STATUS_CHECK_EXPRESSION },
    { name: 'organization_odoo_binding_status_check', expression: BINDING_STATUS_CHECK_EXPRESSION },
  ],
});

export const Member = defineEntity({
  name: 'Member',
  tableName: 'member',
  properties: {
    id: p.string().primary(),
    // 租级归属冗余列（同上·切片 C 换轴后仓储读谓词锚本列）。
    tenantId: p.string().nullable(),
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
    tenantId: p.string().nullable(),
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

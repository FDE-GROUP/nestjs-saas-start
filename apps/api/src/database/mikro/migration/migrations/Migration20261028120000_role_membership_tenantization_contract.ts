import { Migration } from '@mikro-orm/migrations';

/**
 * X7 成员与角色彻底租级化 · 切片 C **contract 段**（global-role-membership-tenantization·换轴契约）。
 *
 * 承接 expand 段（`Migration20261027153000`）之后落地「授权轴上收租级」的**破坏性收紧**：
 *  - `tenant_role_grant` **DROP `organizationId` 收窄列**（连带其 FK `tenant_role_grant_organizationId_foreign`
 *    与读侧索引 `tenant_role_grant_org_idx`·均由 `Migration20261026190133_grant_org_scope` 引入）——
 *    **推翻第三次层级复裁 D1**（原「子公司管理员」组织收窄维·grant 改经 `roleId→tenant_role(tenantId,key)`
 *    链归属租户·跨 org 通配生效）；
 *  - `tenant_role_audit.organizationId` 由 `not null` 降 **nullable**（审计改按租户主轴盖章·org 列仅供历史行兼容·
 *    写侧留 NULL）。
 *
 * ⚠ 本迁移**手写命令式**、不走 `migration:generate`——X8 成员计数触发器（`member_tenant_count_sync`/
 * `organization_tenant_relink_count_sync`）系迁移命令式建立、未入实体元数据·若交 generate 会被误判为 schema
 * 漂移而连带 DROP（不可逆·已登经验条）。列形与 `rbac.entities.ts` META 单源逐列对齐（grant 无 org 列·
 * audit org `nullable:true`），故 fresh 全链回放 DDL 恒等于纯实体派生。
 *
 * ⚠ 真库/生产落库执行前另须人亲签（沿 X8-1/片一二三 高危纪律·dev/Testcontainers 一次性库演练属标准验证可径跑）。
 *
 * @see expand 段 Migration20261027153000_role_membership_tenantization_expand
 * @see grant org 列来源 Migration20261026190133_grant_org_scope（本段为其逆向 + 审计列收紧）
 */
export class Migration20261028120000_role_membership_tenantization_contract extends Migration {
  override name = 'Migration20261028120000_role_membership_tenantization_contract';

  override up(): void | Promise<void> {
    // —— grant 去组织收窄维（逆向 grant_org_scope·保序 constraint→index→column）——
    this.addSql(
      `alter table "tenant_role_grant" drop constraint "tenant_role_grant_organizationId_foreign";`,
    );
    this.addSql(`drop index "tenant_role_grant_org_idx";`);
    this.addSql(`alter table "tenant_role_grant" drop column "organizationId";`);
    // —— 审计 org 列降 nullable（写侧改留 NULL·历史非空行不动）——
    this.addSql(`alter table "tenant_role_audit" alter column "organizationId" drop not null;`);
  }

  override down(): void | Promise<void> {
    // 逆序复原：审计列改回 not null → grant 复活 org 收窄列（constraint/index/column）。
    // ⚠ 审计 `set not null` 仅在库内无 `organizationId IS NULL` 行时可过（即 contract 后未落租级 NULL 审计写）——
    //   一次性 dev/Testcontainers 演练（up 后立刻 down·中间无应用写）恒过；真库若有租级留痕行须先人工归一 org 再回退。
    this.addSql(`alter table "tenant_role_audit" alter column "organizationId" set not null;`);
    this.addSql(`alter table "tenant_role_grant" add "organizationId" text null;`);
    this.addSql(
      `create index "tenant_role_grant_org_idx" on "tenant_role_grant" ("roleId", "organizationId");`,
    );
    this.addSql(
      `alter table "tenant_role_grant" add constraint "tenant_role_grant_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );
  }
}

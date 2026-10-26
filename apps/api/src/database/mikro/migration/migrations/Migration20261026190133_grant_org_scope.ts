import { Migration } from '@mikro-orm/migrations';

/**
 * RBAC grant 行组织收窄维复活（第三次层级复裁·组织权限维复活 切片 2·D1）。
 *
 * `tenant_role_grant` 加 `organizationId`（nullable text·FK→organization 级联删）+ `(roleId, organizationId)`
 * 读侧索引。语义：NULL=**租级通配**（跨 org 生效·存量 seed/旧行回填皆 NULL→零行为变更），
 * 非 NULL=仅在该 org 生效（子公司管理员）。角色目录 `tenant_role` 仍纯租级 `unique(tenantId,key)` 不动
 * （片三 K5 塌缩不反）·org 权限维**唯一落本 grant 列**。本片纯 additive（加可空列+索引）·无回填无破坏。
 *
 * ⚠ 真库/生产落库执行前另须人亲签（沿片一/片二/片三 高危纪律·dev/Testcontainers 一次性库演练属标准验证可径跑）。
 */
export class Migration20261026190133_grant_org_scope extends Migration {
  override name = 'Migration20261026190133_grant_org_scope';

  override up(): void | Promise<void> {
    this.addSql(`alter table "tenant_role_grant" add "organizationId" text null;`);
    this.addSql(
      `alter table "tenant_role_grant" add constraint "tenant_role_grant_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );
    this.addSql(
      `create index "tenant_role_grant_org_idx" on "tenant_role_grant" ("roleId", "organizationId");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "tenant_role_grant" drop constraint "tenant_role_grant_organizationId_foreign";`,
    );
    this.addSql(`drop index "tenant_role_grant_org_idx";`);
    this.addSql(`alter table "tenant_role_grant" drop column "organizationId";`);
  }
}

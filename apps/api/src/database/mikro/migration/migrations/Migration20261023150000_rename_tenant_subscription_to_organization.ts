import { Migration } from '@mikro-orm/migrations';

/**
 * `tenant_subscription` → `organization_subscription`（global-tenant-isolation-vocabulary 切片 A·R1 业务补修）。
 *
 * 保数据 RENAME：表 + 列 + 约束 + 索引全部 rename，数据零动。
 * 历史工件 `Migration20261016055354`（建表 DDL）不改（append-only 档案如实）。
 *
 * 落库执行须人亲签（高危#1）。
 */
export class Migration20261023150000_rename_tenant_subscription_to_organization extends Migration {
  override name = 'Migration20261023150000_rename_tenant_subscription_to_organization';

  override up(): void | Promise<void> {
    // 1. 表
    this.addSql(`alter table "tenant_subscription" rename to "organization_subscription";`);

    // 2. 列 tenantId → organizationId
    this.addSql(
      `alter table "organization_subscription" rename column "tenantId" to "organizationId";`,
    );

    // 3. PK 约束
    this.addSql(
      `alter table "organization_subscription" rename constraint "tenant_subscription_pkey" to "organization_subscription_pkey";`,
    );

    // 4. FK 约束
    this.addSql(
      `alter table "organization_subscription" rename constraint "tenant_subscription_tenantId_foreign" to "organization_subscription_organizationId_foreign";`,
    );

    // 5. 索引
    this.addSql(
      `alter index "tenant_subscription_tenant_status_idx" rename to "organization_subscription_org_status_idx";`,
    );
    this.addSql(
      `alter index "tenant_subscription_tenant_period_idx" rename to "organization_subscription_org_period_idx";`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter index "organization_subscription_org_period_idx" rename to "tenant_subscription_tenant_period_idx";`,
    );
    this.addSql(
      `alter index "organization_subscription_org_status_idx" rename to "tenant_subscription_tenant_status_idx";`,
    );
    this.addSql(
      `alter table "organization_subscription" rename constraint "organization_subscription_organizationId_foreign" to "tenant_subscription_tenantId_foreign";`,
    );
    this.addSql(
      `alter table "organization_subscription" rename constraint "organization_subscription_pkey" to "tenant_subscription_pkey";`,
    );
    this.addSql(
      `alter table "organization_subscription" rename column "organizationId" to "tenantId";`,
    );
    this.addSql(`alter table "organization_subscription" rename to "tenant_subscription";`);
  }
}

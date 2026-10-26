import { Migration } from '@mikro-orm/migrations';

/**
 * global-tenant-organization-rehierarchy 片二 K2（contract 收缩·旧表物理 DROP）——
 * `organization_subscription` 旧表读写链已于切片 D 全量切至 `tenant_subscription`（计费锚上移租户），
 * 本件将其从 schema 彻底消除（expand 段过渡态收口）。`cascade` 随行带走 FK
 * `organization_subscription_organizationId_foreign`（organizationId→organization·无入指依赖）。
 *
 * 落库执行须人亲签（高危#1·DROP TABLE 不可逆）。
 */
export class Migration20261026153753_drop_organization_subscription extends Migration {
  override name = 'Migration20261026153753_drop_organization_subscription';

  override up(): void | Promise<void> {
    this.addSql(`drop table if exists "organization_subscription" cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `create table "organization_subscription" ("apiQuota" int null, "createdAt" timestamp not null default now(), "id" text not null, "organizationId" text not null, "periodEnd" timestamp null, "periodStart" timestamp not null default now(), "plan" text not null, "provider" text null, "providerCustomerId" text null, "providerSubscriptionId" text null, "seatsLimit" int not null, "status" text not null default 'active', "storageQuota" int null, "updatedAt" timestamp not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "organization_subscription_org_period_idx" on "organization_subscription" ("organizationId", "periodStart");`,
    );
    this.addSql(
      `create index "organization_subscription_org_status_idx" on "organization_subscription" ("organizationId", "status");`,
    );

    this.addSql(
      `alter table "organization_subscription" add constraint "organization_subscription_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );

    // 尽力而为（dev 回滚口径·无存量生产）：从 `tenant_subscription` 经组织边回灌订阅行——
    // 1:1 骨架时期 organizationId 唯一可解；多组织共租后本式取该租下任一组织（回灌非无损·沿 backfill 先例幂等防重）。
    // 旧表 `updatedAt` NOT NULL，新表 nullable，故 coalesce 兑底。
    this.addSql(`
      insert into "organization_subscription" ("id", "organizationId", "plan", "status", "seatsLimit",
        "storageQuota", "apiQuota", "periodStart", "periodEnd", "provider",
        "providerCustomerId", "providerSubscriptionId", "createdAt", "updatedAt")
      select ts."id", o."id", ts."plan", ts."status", ts."seatsLimit", ts."storageQuota",
             ts."apiQuota", ts."periodStart", ts."periodEnd", ts."provider",
             ts."providerCustomerId", ts."providerSubscriptionId", ts."createdAt", coalesce(ts."updatedAt", now())
      from "tenant_subscription" ts
      join "organization" o on o."tenantId" = ts."tenantId"
      where not exists (select 1 from "organization_subscription" s where s."id" = ts."id");
    `);
  }
}

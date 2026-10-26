import { Migration } from '@mikro-orm/migrations';

/**
 * global-tenant-organization-rehierarchy 切片 B · **schema expand 段**（人批准计划 2026-10-26·
 * 真库落库执行属高危 #1 另须亲签）——新层 `tenant`（组织之父行·非旧旁表血脉）+ 计费上移新表
 * `tenant_subscription`（旧表并存至 contract 段退役）+ 七表 `tenantId` additive **nullable** 列
 *（organization/post/workspace/member/invitation/organization_role/organization_role_audit·
 * FK→tenant cascade 给租户级联删除留 NFR-6 血脉）。
 *
 * NOT NULL/unique 收紧与旧表退役均留 contract 段；数据回填见下一工件
 * `Migration20261026084000_backfill_tenant_from_organizations`。本工件系 `migration:generate` 产物，
 * SQL 体未手改（恒等闸对拍面）。
 */
export class Migration20261026083823_add_tenant_hierarchy extends Migration {
  override name = 'Migration20261026083823_add_tenant_hierarchy';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "tenant" ("id" text not null, "name" text not null, "slug" text not null, "status" text not null default 'active', "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );

    this.addSql(
      `create table "tenant_subscription" ("id" text not null, "tenantId" text not null, "plan" text not null, "status" text not null default 'active', "seatsLimit" int not null, "storageQuota" int null, "apiQuota" int null, "periodStart" timestamp not null default now(), "periodEnd" timestamp null, "provider" text null, "providerCustomerId" text null, "providerSubscriptionId" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );
    this.addSql(
      `create index "tenant_subscription_tenant_status_idx" on "tenant_subscription" ("tenantId", "status");`,
    );
    this.addSql(
      `create index "tenant_subscription_tenant_period_idx" on "tenant_subscription" ("tenantId", "periodStart");`,
    );

    this.addSql(`alter table "organization" add "tenantId" text null;`);
    this.addSql(
      `alter table "organization" add constraint "organization_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(`alter table "organization_role" add "tenantId" text null;`);
    this.addSql(
      `alter table "organization_role" add constraint "organization_role_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(`alter table "organization_role_audit" add "tenantId" text null;`);
    this.addSql(
      `alter table "organization_role_audit" add constraint "organization_role_audit_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(`alter table "member" add "tenantId" text null;`);
    this.addSql(
      `alter table "member" add constraint "member_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(`alter table "invitation" add "tenantId" text null;`);
    this.addSql(
      `alter table "invitation" add constraint "invitation_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(`alter table "workspace" add "tenantId" text null;`);
    this.addSql(
      `alter table "workspace" add constraint "workspace_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(`alter table "post" add "tenantId" text null;`);
    this.addSql(
      `alter table "post" add constraint "post_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "tenant" add constraint "tenant_status_check" check (status IN ('pending_approval', 'active', 'suspended', 'deleted'));`,
    );

    this.addSql(
      `alter table "tenant_subscription" add constraint "tenant_subscription_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "organization" drop constraint "organization_tenantId_foreign";`);
    this.addSql(
      `alter table "organization_role" drop constraint "organization_role_tenantId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_subscription" drop constraint "tenant_subscription_tenantId_foreign";`,
    );
    this.addSql(
      `alter table "organization_role_audit" drop constraint "organization_role_audit_tenantId_foreign";`,
    );
    this.addSql(`alter table "member" drop constraint "member_tenantId_foreign";`);
    this.addSql(`alter table "invitation" drop constraint "invitation_tenantId_foreign";`);
    this.addSql(`alter table "workspace" drop constraint "workspace_tenantId_foreign";`);
    this.addSql(`alter table "post" drop constraint "post_tenantId_foreign";`);

    this.addSql(`drop table if exists "tenant" cascade;`);
    this.addSql(`drop table if exists "tenant_subscription" cascade;`);

    this.addSql(`alter table "invitation" drop column "tenantId";`);

    this.addSql(`alter table "member" drop column "tenantId";`);

    this.addSql(`alter table "organization" drop column "tenantId";`);

    this.addSql(`alter table "organization_role" drop column "tenantId";`);

    this.addSql(`alter table "organization_role_audit" drop column "tenantId";`);

    this.addSql(`alter table "post" drop column "tenantId";`);

    this.addSql(`alter table "workspace" drop column "tenantId";`);
  }
}

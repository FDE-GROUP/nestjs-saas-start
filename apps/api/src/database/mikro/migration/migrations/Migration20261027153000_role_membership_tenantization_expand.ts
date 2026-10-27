import { Migration } from '@mikro-orm/migrations';

/**
 * X7 成员与角色彻底租级化 · 切片 B **expand 段**（global-role-membership-tenantization·纯 additive）。
 *
 * 建三张自有租级 SSOT 表（`tenant_membership`/`tenant_role_assignment`/`tenant_invitation`）+ 从 BA
 * `member`（org 维）派生回填成员/角色：
 *  - `tenant_membership`：user 在租户内**任一** org 有 BA member 行 → 建一条 `(tenantId,userId)` 租成员；
 *  - `tenant_role_assignment`：同租多 org 角色冲突取**最高权**（裁点④ `owner > admin > member`·system-role key 实证小写）。
 *
 * ⚠ 本段**刻意不动** `tenant_role_grant.organizationId` / `tenant_role_audit.organizationId`，亦**不触碰** X8 成员计数
 * 触发器（`member_tenant_count_sync`/`organization_tenant_relink_count_sync` 系迁移命令式建立、未入实体元数据·
 * 若交 `migration:generate` 会被误判为 schema 漂移而 DROP）。grant 去 org 列 + 审计列改 nullable + 计数面重锚 `tenant_membership`
 * 触发器，皆随**契约段**（切片 C/D·换轴与代码协同）落地，保每段可独立回放、`down()` 可逆。
 *
 * ⚠ 真库/生产落库执行前另须人亲签（沿 X8-1/片一二三 高危纪律·dev/Testcontainers 一次性库演练属标准验证可径跑）。
 */
export class Migration20261027153000_role_membership_tenantization_expand extends Migration {
  override name = 'Migration20261027153000_role_membership_tenantization_expand';

  override up(): void | Promise<void> {
    // —— 建三表（列形与 `rbac.entities.ts` META 逐列对齐·buildMigrationEntity 派生 DDL 恒等）——
    this.addSql(
      `create table "tenant_membership" ("id" text not null, "tenantId" text not null, "userId" text not null, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "tenant_membership" add constraint "tenant_membership_tenant_user_idx" unique ("tenantId", "userId");`,
    );
    this.addSql(
      `create table "tenant_role_assignment" ("id" text not null, "tenantId" text not null, "userId" text not null, "roleKey" text not null, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "tenant_role_assignment" add constraint "tenant_role_assignment_tenant_user_idx" unique ("tenantId", "userId");`,
    );
    this.addSql(
      `create table "tenant_invitation" ("id" text not null, "tenantId" text not null, "email" text not null, "roleKey" text not null, "invitorId" text null, "status" text not null default 'pending', "token" text not null, "expiresAt" timestamp null, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );
    this.addSql(`create index "tenant_invitation_token_idx" on "tenant_invitation" ("token");`);
    this.addSql(
      `alter table "tenant_invitation" add constraint "tenant_invitation_tenant_email_idx" unique ("tenantId", "email");`,
    );
    this.addSql(
      `alter table "tenant_membership" add constraint "tenant_membership_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant_membership" add constraint "tenant_membership_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant_role_assignment" add constraint "tenant_role_assignment_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant_role_assignment" add constraint "tenant_role_assignment_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant_invitation" add constraint "tenant_invitation_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant_invitation" add constraint "tenant_invitation_invitorId_foreign" foreign key ("invitorId") references "user" ("id") on delete set null;`,
    );

    // —— 回填成员：user 在租内任一 org 有 BA member → 租成员一行（group by 去重多组织）——
    this.addSql(
      `insert into "tenant_membership" ("id", "tenantId", "userId", "createdAt")
       select md5(o."tenantId" || '@' || m."userId"), o."tenantId", m."userId", now()
       from "member" m
       join "organization" o on o."id" = m."organizationId"
       where o."tenantId" is not null
       group by o."tenantId", m."userId";`,
    );

    // —— 回填角色分配：同租多 org 取最高权（owner > admin > member·BA member.role 小写实证）——
    this.addSql(
      `insert into "tenant_role_assignment" ("id", "tenantId", "userId", "roleKey", "createdAt")
       select md5(x."tenantId" || '@' || x."userId"), x."tenantId", x."userId",
              case
                when bool_or(x."role" = 'owner') then 'owner'
                when bool_or(x."role" = 'admin') then 'admin'
                else 'member'
              end,
              now()
       from (
         select o."tenantId" as "tenantId", m."userId" as "userId", m."role" as "role"
         from "member" m
         join "organization" o on o."id" = m."organizationId"
         where o."tenantId" is not null
       ) x
       group by x."tenantId", x."userId";`,
    );
  }

  override down(): void | Promise<void> {
    // 三表皆为 BA `member` 派生的新 SSOT·回退仅撤表（无原始数据被改写·grant/audit/X8 触发器本段未触）。
    this.addSql(`drop table if exists "tenant_invitation" cascade;`);
    this.addSql(`drop table if exists "tenant_role_assignment" cascade;`);
    this.addSql(`drop table if exists "tenant_membership" cascade;`);
  }
}

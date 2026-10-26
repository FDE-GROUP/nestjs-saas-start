import { Migration } from '@mikro-orm/migrations';

/**
 * global-tenant-organization-rehierarchy 片二 K3（非角色残留列收口·自裁 A）——
 * `member.tenantId` / `invitation.tenantId` 系 expand 段同批回填的租级冗余列，BA 建员/邀请机器
 * 从不写本列（只写 `organizationId`）、且全仓零读依赖（租级归属一律经 `organization.tenantId` 派生
 * ·见 `mikro-quota.store.countMembers` 组边 join），故 contract 段安全退役 DROP（连同其 FK→tenant）。
 *
 * `organization/post/workspace.tenantId` 本片**不收紧**（§54 回退坐实）：organization 走 BA `createOrganization`
 * 先建后盖·NOT NULL 破插入语句；post 系适配器写侧列不入域 `PostState`·升 NOT NULL 与投影同构锁相左。
 * 两列均维持应用层强制 + `requireActiveTenantId` 谓词 + gated e2e 结构卡控。
 *
 * 落库执行须人亲签（高危#1·DROP COLUMN 不可逆）。
 */
export class Migration20261026155617_shrink_member_invitation_tenantid extends Migration {
  override name = 'Migration20261026155617_shrink_member_invitation_tenantid';

  override up(): void | Promise<void> {
    this.addSql(`alter table "member" drop constraint "member_tenantId_foreign";`);

    this.addSql(`alter table "invitation" drop constraint "invitation_tenantId_foreign";`);

    this.addSql(`alter table "member" drop column "tenantId";`);

    this.addSql(`alter table "invitation" drop column "tenantId";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "invitation" add "tenantId" text null;`);
    this.addSql(
      `alter table "invitation" add constraint "invitation_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    this.addSql(`alter table "member" add "tenantId" text null;`);
    this.addSql(
      `alter table "member" add constraint "member_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );

    // 尽力而为（dev 回滚口径）：沿组织边回灌 expand 段同批回填值（与 20261026084000 step3 同式·join 解析不假设骨架 id 等值）。
    for (const table of ['member', 'invitation']) {
      this.addSql(`
        update "${table}" x set "tenantId" = o."tenantId"
        from "organization" o
        where o."id" = x."organizationId" and x."tenantId" is null;
      `);
    }
  }
}

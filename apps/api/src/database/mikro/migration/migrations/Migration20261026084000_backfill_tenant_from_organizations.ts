import { Migration } from '@mikro-orm/migrations';

/**
 * global-tenant-organization-rehierarchy 切片 B · **数据回填**（1:1 骨架·人批准计划 2026-10-26）——
 * 为每个现存 organization 生成专属 tenant（name/slug 复制·id 复用 org id 作确定性骨架键），
 * 再把 tenantId 沿组织边下灌至 member/invitation/post/workspace/organization_role/organization_role_audit，
 * 订阅行自 `organization_subscription` 对偶平移入 `tenant_subscription`（expand 段两表并存·读链未切）。
 *
 * 语义等价律（迁移前后逐行核）：
 *  - `tenant.status` 承 `organization.status` 原值——1:1 时期两者同持治理态（旧裁定下 org.status
 *    本就是租户准入态；本案将其**上移归位** tenant，organization 留轻量自有态·切片 D 语义随动）；
 *  - `tenant.createdAt` 承 org 行创建时刻（户籍与子嗣同龄·coalesce 兜底沿 backfill 先例）；
 *  - 子表 `tenantId = organization.tenantId`（经组织边 join 而非裸复制——不依赖骨架 id 等值假设，
 *    未来多组织共租户的拓扑下本式仍正确）；子表 `organizationId` 均 NOT NULL FK，无孤儿行可跳；
 *  - `tenant_subscription` 行**整体对偶搬入**（id 同值·tenantId 经组织边解析）；旧表不动不删，
 *    切片 D 换轨后 contract 段退役。
 * 幂等防重：NOT EXISTS / tenantId IS NULL 守卫，重复 apply 零副作用（沿 20261020075700 先例纪律）。
 */
export class Migration20261026084000_backfill_tenant_from_organizations extends Migration {
  override name = 'Migration20261026084000_backfill_tenant_from_organizations';

  override up(): void | Promise<void> {
    // 1) 每 org 造专属 tenant（1:1 骨架·id 复用）。
    this.addSql(`
      insert into "tenant" ("id", "name", "slug", "status", "createdAt")
      select o."id", o."name", o."slug", o."status", coalesce(o."createdAt", now())
      from "organization" o
      where not exists (select 1 from "tenant" t where t."id" = o."id");
    `);

    // 2) 组织边盖章：organization.tenantId = 专属 tenant id。
    this.addSql(`
      update "organization" o set "tenantId" = o."id" where o."tenantId" is null;
    `);

    // 3) 子表沿组织边下灌（join 解析·不假设骨架 id 等值）。
    for (const table of [
      'member',
      'invitation',
      'post',
      'workspace',
      'organization_role',
      'organization_role_audit',
    ]) {
      this.addSql(`
        update "${table}" x set "tenantId" = o."tenantId"
        from "organization" o
        where o."id" = x."organizationId" and x."tenantId" is null;
      `);
    }

    // 4) 订阅行对偶平移（计费上移·旧表并存不动）。
    this.addSql(`
      insert into "tenant_subscription" ("id", "tenantId", "plan", "status", "seatsLimit",
        "storageQuota", "apiQuota", "periodStart", "periodEnd", "provider",
        "providerCustomerId", "providerSubscriptionId", "createdAt", "updatedAt")
      select s."id", o."tenantId", s."plan", s."status", s."seatsLimit", s."storageQuota",
             s."apiQuota", s."periodStart", s."periodEnd", s."provider",
             s."providerCustomerId", s."providerSubscriptionId", s."createdAt", s."updatedAt"
      from "organization_subscription" s
      join "organization" o on o."id" = s."organizationId"
      where not exists (select 1 from "tenant_subscription" ts where ts."id" = s."id");
    `);
  }

  override down(): void | Promise<void> {
    // 尽力而为（dev 回滚口径·无存量生产）：清子表盖章与搬入行；tenant/tenant_subscription 表本体
    // 随前一 schema 工件 down 的 drop table cascade 一并消灭（沿 20261020075700 先例分工）。
    this.addSql(`delete from "tenant_subscription";`);
    this.addSql(`update "organization" set "tenantId" = null;`);
    for (const table of [
      'member',
      'invitation',
      'post',
      'workspace',
      'organization_role',
      'organization_role_audit',
    ]) {
      this.addSql(`update "${table}" set "tenantId" = null;`);
    }
  }
}

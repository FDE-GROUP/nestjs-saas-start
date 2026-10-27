import { Migration } from '@mikro-orm/migrations';

/**
 * 第三次层级复裁 · 切片 6（D3 状态退役 + D5 slug 约束·pt4/pt8）。
 *
 * D3 DROP `organization.status`（+ `organization_status_check`）：治理生命周期权威态单一锥已上移归位
 * `tenant.status`（片一），`organization.status` 系 K1 退役 `OrganizationStatusService` 后的**运行时死列**
 * （无任何生产读写·唯一实据 e2e 随之换形）——本段清理该自撰域列（非 BA 约定字段·合红线）。
 *
 * D5 slug 约束（contract 段收紧）：
 * - `organization (tenantId, slug)` 唯一——跨租同名 slug 不再互斥，仅同一租户内唯一（层级 Tenant ⊃ Org 语义）。
 * - `tenant.slug` **全局唯一**——早先 expand 段不预支（1:1 骨架回填碰 dup 即炸），本段加 global unique。
 * 加约束前先**防御性去重**（对无重复库为幂等空操作·留最早 createdAt 行、余者后缀 `-{id 前 6 md5}` 消歧）。
 *
 * ⚠ **绝不触碰切片 5 的物化触发器/函数**：MikroORM schema 生成器不识别裸 SQL 触发器（非实体 hook），故 `generate`
 * 会误报「DROP member_tenant_count_sync / organization_tenant_relink_count_sync 及其函数」为漂移——本迁移**手工
 * 剥离**这些语句（切片 5 触发器由 `Migration20261027023319` 定义·`--fresh` 重放在本迁移之前·存活无损）。此为
 * 生成物须人工审阅的实例（tooling §4）。
 */
export class Migration20261027025451_slice6_org_status_retire_slug_unique extends Migration {
  override name = 'Migration20261027025451_slice6_org_status_retire_slug_unique';

  override up(): void | Promise<void> {
    // D5-a：tenant.slug 全局唯一前置去重（同 slug 保 createdAt 最早者·余后缀消歧·幂等于无 dup 库）。
    this.addSql(`
      update "tenant" t set "slug" = t."slug" || '-' || left(md5(t."id"), 6)
      where exists (
        select 1 from "tenant" o
        where o."slug" = t."slug"
          and (o."createdAt" < t."createdAt"
               or (o."createdAt" = t."createdAt" and o."id" < t."id"))
      );
    `);
    this.addSql(`alter table "tenant" add constraint "tenant_slug_unique" unique ("slug");`);

    // D5-b：organization (tenantId, slug) 唯一前置去重（仅对已盖租行·NULL-tenantId 行 PG 视为互异不参与）。
    this.addSql(`
      update "organization" x set "slug" = x."slug" || '-' || left(md5(x."id"), 6)
      where x."tenantId" is not null
        and exists (
          select 1 from "organization" y
          where y."tenantId" = x."tenantId" and y."slug" = x."slug"
            and (y."createdAt" < x."createdAt"
                 or (y."createdAt" = x."createdAt" and y."id" < x."id"))
        );
    `);
    this.addSql(
      `alter table "organization" add constraint "organization_tenantId_slug_unique" unique ("tenantId", "slug");`,
    );

    // D3：DROP organization.status（先摘 CHECK 后删列）。
    this.addSql(`alter table "organization" drop constraint "organization_status_check";`);
    this.addSql(`alter table "organization" drop column "status";`);
  }

  override down(): void | Promise<void> {
    // 逆操作（dev 回滚口径·无存量生产）：还原 organization.status（自 tenant.status 回填权威态）→
    // 摘两个 unique 约束 → tenant.slug 后缀去重回滚不做（幂等·仅回列/约束形态）。
    this.addSql(`alter table "organization" drop constraint "organization_tenantId_slug_unique";`);
    this.addSql(`alter table "organization" add "status" text not null default 'active';`);
    this.addSql(
      `alter table "organization" add constraint "organization_status_check" check ("status" IN ('pending_approval', 'active', 'suspended', 'deleted'));`,
    );
    this.addSql(`
      update "organization" o set "status" = coalesce(t."status", 'active')
      from "tenant" t where t."id" = o."tenantId";
    `);
    this.addSql(`alter table "tenant" drop constraint "tenant_slug_unique";`);
  }
}

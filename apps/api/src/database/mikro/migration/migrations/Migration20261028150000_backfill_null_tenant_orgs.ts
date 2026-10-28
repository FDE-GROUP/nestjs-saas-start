import { Migration } from '@mikro-orm/migrations';

/**
 * X7 成员与角色彻底租级化 · 切片 G **G4**（R4 结构闭合·纯 DML backfill·零 schema 漂移）。
 *
 * 闭合第四轮评估 R4「NULL-tenant 骨架 org 成员 403」：换轴后角色从 `tenant_role_assignment` 解、可见性/
 * 席位从 `tenant_membership` 解、隔离主轴从 `organization.tenantId` 派生——故 `organization.tenantId IS NULL`
 * 的骨架 org（`20261026084000` 1:1 backfill 之后才落库、provisioning 未盖租的增量·或历史遗留）其成员
 * 解析不到任何租户 → 全 `@Can` fail-closed 403。本迁移为每个此类 org 自动 **re-parent** 至新建专属租户：
 *
 *  1. 合成 1:1 骨架租户（`tenant.id = organization.id`·沿 `20261026084000` 键范式）：`status='active'`
 *     （裁点①·免对既有可用 org 新增审批门控）、`orgVisibility='shared'`、`memberCount=0`、name 承 org；
 *  2. `organization.tenantId ← 专属租户 id`（仅当目标租户行确在·防 FK 违例）——触发既有
 *     `organization_tenant_relink_count_sync` 触发器把该 org 名下 BA `member` 实数补计进 `memberCount`；
 *  3. 沿 expand 段（`Migration20261027153000`）口径据 BA `member` 为**这些新租**补 `tenant_membership` +
 *     `tenant_role_assignment`（同租多 org 取最高权 `owner > admin > member`·裁点④），令成员可解角色·不再 403。
 *
 * **幂等**：`where not exists` / `tenantId is null` 守卫，重复 apply 零副作用（沿 `20261026084000` 纪律）。
 * **slug 去重容错**（plan 风险项）：合成租 slug 恒带自描述哨兵后缀 `-x7r4-<orgId>`（org id 唯一 → slug 必唯一·
 * 绝不与既有 `tenant_slug_unique` 碰撞），同时为 `down()` 提供精确可逆标识——**仅删本次合成者·勿误伤既有租**。
 * **`down()` 逆序**：删合成租派生的 `tenant_role_assignment`/`tenant_membership` → 复位 `organization.tenantId=NULL`
 * （触发 relink −N）→ 删合成 `tenant` 行（按哨兵 slug 收敛·纯 DML·无 schema 变更故 generate 零漂移）。
 *
 * ⚠ 本迁移**手写命令式**·不走 `migration:generate`（无 DDL·纯数据回填·沿 expand/contract 同律·X8 计数触发器
 *   命令式建立未入实体元数据·交 generate 会被误判漂移）。
 * ⚠ **真库/生产落库执行前另须人亲签**（沿 X8-1/片一二三/G1-G3 高危纪律·dev/Testcontainers 一次性库演练属标准验证可径跑）。
 *
 * @see expand 段 Migration20261027153000_role_membership_tenantization_expand（成员/角色回填口径单源）
 * @see 1:1 骨架键范式 Migration20261026084000_backfill_tenant_from_organizations
 */
export class Migration20261028150000_backfill_null_tenant_orgs extends Migration {
  override name = 'Migration20261028150000_backfill_null_tenant_orgs';

  override up(): void | Promise<void> {
    // 1) 为每个「无租户归属且尚无专属租户行」的骨架 org 合成 1:1 专属租（幂等·slug 带哨兵唯一后缀）。
    this.addSql(`
      insert into "tenant" ("id", "name", "slug", "status", "orgVisibility", "memberCount", "createdAt")
      select o."id", o."name", o."slug" || '-x7r4-' || o."id", 'active', 'shared', 0, coalesce(o."createdAt", now())
      from "organization" o
      where o."tenantId" is null
        and not exists (select 1 from "tenant" t where t."id" = o."id");
    `);

    // 2) 组织边盖章（仅当专属租户行确在·防 FK 违例）——触发 relink 触发器把该 org BA member 实数补计 memberCount。
    this.addSql(`
      update "organization" o set "tenantId" = o."id"
      where o."tenantId" is null
        and exists (select 1 from "tenant" t where t."id" = o."id");
    `);

    // 3) 据 BA member 为新租补租级成员（group by 去重多组织·not exists 幂等防重放）。
    this.addSql(`
      insert into "tenant_membership" ("id", "tenantId", "userId", "createdAt")
      select md5(x."tenantId" || '@' || x."userId"), x."tenantId", x."userId", now()
      from (
        select o."tenantId" as "tenantId", m."userId" as "userId"
        from "member" m
        join "organization" o on o."id" = m."organizationId"
        where o."tenantId" in (select t."id" from "tenant" t where t."slug" like '%-x7r4-%')
        group by o."tenantId", m."userId"
      ) x
      where not exists (
        select 1 from "tenant_membership" tm where tm."tenantId" = x."tenantId" and tm."userId" = x."userId"
      );
    `);

    // 4) 据 BA member 为新租补角色分配（同租多 org 取最高权 owner>admin>member·not exists 幂等）。
    this.addSql(`
      insert into "tenant_role_assignment" ("id", "tenantId", "userId", "roleKey", "createdAt")
      select md5(y."tenantId" || '@' || y."userId"), y."tenantId", y."userId", y."roleKey", now()
      from (
        select x."tenantId" as "tenantId", x."userId" as "userId",
               case
                 when bool_or(x."role" = 'owner') then 'owner'
                 when bool_or(x."role" = 'admin') then 'admin'
                 else 'member'
               end as "roleKey"
        from (
          select o."tenantId" as "tenantId", m."userId" as "userId", m."role" as "role"
          from "member" m
          join "organization" o on o."id" = m."organizationId"
          where o."tenantId" in (select t."id" from "tenant" t where t."slug" like '%-x7r4-%')
        ) x
        group by x."tenantId", x."userId"
      ) y
      where not exists (
        select 1 from "tenant_role_assignment" ra where ra."tenantId" = y."tenantId" and ra."userId" = y."userId"
      );
    `);
  }

  override down(): void | Promise<void> {
    // 逆序拆除「仅本次合成者」（slug 哨兵收敛·勿误伤既有租）：删派生 role→membership→复位 org.tenantId→删合成租。
    this.addSql(`
      delete from "tenant_role_assignment" ra
      where ra."tenantId" in (select t."id" from "tenant" t where t."slug" like '%-x7r4-%');
    `);
    this.addSql(`
      delete from "tenant_membership" tm
      where tm."tenantId" in (select t."id" from "tenant" t where t."slug" like '%-x7r4-%');
    `);
    // 复位组织归属（relink 触发器 −N·随即删租行故 −N 无残留影响）——必先于删租（否则 org FK 挡删）。
    this.addSql(`
      update "organization" o set "tenantId" = null
      where o."tenantId" in (select t."id" from "tenant" t where t."slug" like '%-x7r4-%');
    `);
    this.addSql(`
      delete from "tenant" where "slug" like '%-x7r4-%';
    `);
  }
}

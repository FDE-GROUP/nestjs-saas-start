import { Migration } from '@mikro-orm/migrations';

/**
 * P0 安全缺陷修复第三批 · X8-1：`member_tenant_count_sync` 触发器补 **AFTER UPDATE OF `organizationId`** 支。
 *
 * 根因（切片 5 遗留缺口）：`member_tenant_count_sync` 仅挂 `after insert or delete`（见
 * `Migration20261027023319_tenant_member_count_materialized`），**不挂 UPDATE**——把 member 从 A 组织移到
 * B 组织（尤其跨租）仅改 `organizationId`·无增删行 → 旧租/新租 `memberCount` 双向漂移 → 席位闸读数失真
 * （`countMembers` 直读物化列·少算侧可 fail-open 超卖）。
 *
 * 修法（纯 additive·可逆·无破坏性·不动既有列/数据语义）：`create or replace function` 保留原 INSERT/DELETE
 * 两支**逐字不动**，新增 UPDATE 支——旧/新 `organizationId` distinct 时旧租 −1 + 新租 +1；同租换组织净 0
 * （正确·成员仍在本租）；旧/新 org 未盖租（tenantId NULL）→ `where id = NULL` 命中零行·安全跳过（与原两支
 * 同款保守语义）。触发器 recreate 加 `or update of "organizationId"`。
 *
 * `down()` 回退至切片 5 末态：drop trigger 后重 `create trigger ... after insert or delete ...`；函数回退为
 * **仅 INSERT/DELETE 两支**（原样）。不触碰列/数据。沿同目录手写 raw-SQL 先例（非 `migration:generate` 产物·
 * 触发器仅活于 raw-SQL 迁移 + 内省快照，无实体元数据改动）。ts 须 > `20261027023319` 以保 fresh 重放序。
 */
export class Migration20261027120000_member_count_sync_on_org_move extends Migration {
  override name = 'Migration20261027120000_member_count_sync_on_org_move';

  override up(): void | Promise<void> {
    // 1) 函数补 UPDATE 支：INSERT/DELETE 两支逐字沿用切片 5，新增 UPDATE OF organizationId 跨租迁移 ±1。
    this.addSql(`
      create or replace function "tenant_member_count_on_member"() returns trigger
      language plpgsql as $$
      begin
        if tg_op = 'INSERT' then
          update "tenant" set "memberCount" = "memberCount" + 1
            where "id" = (select "tenantId" from "organization" where "id" = new."organizationId");
          return new;
        elsif tg_op = 'DELETE' then
          update "tenant" set "memberCount" = "memberCount" - 1
            where "id" = (select "tenantId" from "organization" where "id" = old."organizationId");
          return old;
        elsif tg_op = 'UPDATE' then
          if old."organizationId" is distinct from new."organizationId" then
            update "tenant" set "memberCount" = "memberCount" - 1
              where "id" = (select "tenantId" from "organization" where "id" = old."organizationId");
            update "tenant" set "memberCount" = "memberCount" + 1
              where "id" = (select "tenantId" from "organization" where "id" = new."organizationId");
          end if;
          return new;
        end if;
        return null;
      end;
      $$;
    `);

    // 2) 触发器 recreate：加 `or update of "organizationId"`（drop 后 create 令 fresh/up/生产链一致存活）。
    this.addSql(`drop trigger if exists "member_tenant_count_sync" on "member";`);
    this.addSql(`
      create trigger "member_tenant_count_sync"
      after insert or delete or update of "organizationId" on "member"
      for each row execute function "tenant_member_count_on_member"();
    `);
  }

  override down(): void | Promise<void> {
    // 逆序回退至切片 5 末态：触发器摘回 `after insert or delete`；函数回退为仅 INSERT/DELETE 两支。不触碰列/数据。
    this.addSql(`drop trigger if exists "member_tenant_count_sync" on "member";`);
    this.addSql(`
      create or replace function "tenant_member_count_on_member"() returns trigger
      language plpgsql as $$
      begin
        if tg_op = 'INSERT' then
          update "tenant" set "memberCount" = "memberCount" + 1
            where "id" = (select "tenantId" from "organization" where "id" = new."organizationId");
          return new;
        elsif tg_op = 'DELETE' then
          update "tenant" set "memberCount" = "memberCount" - 1
            where "id" = (select "tenantId" from "organization" where "id" = old."organizationId");
          return old;
        end if;
        return null;
      end;
      $$;
    `);
    this.addSql(`
      create trigger "member_tenant_count_sync"
      after insert or delete on "member"
      for each row execute function "tenant_member_count_on_member"();
    `);
  }
}

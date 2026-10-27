import { Migration } from '@mikro-orm/migrations';

/**
 * 第三次层级复裁 · 切片 5（D6/评审 pt10）：`tenant` 加租成员数**物化计数列** `memberCount` +
 * 库级触发器增量维护（席位治理读侧 O(1) 化）。
 *
 * 设计（用户裁定：DB 触发器物化，替代 plan 原「outbox 领域事件」措辞）：`member` 由 BA 多路径**直写**
 * （建租者 auto-join / accept-invitation / add-member / removeMember / 级联硬删），**无领域事件发射点**，
 * 故事件投影链无法覆盖全路径——唯库级触发器可作**常正确物化器**。
 *
 * ⚠ **写入顺序隐患必治**（换轴写链实测坐实·seed/stampOrgTenant）：BA `createOrganization` 先落 org 行
 * （`tenantId` NULL）+ 建租者 auto-join member，**后**才由 provisioning `nativeUpdate` 盖 `tenantId`。若触发器
 * 只挂 `member`，建租者插入时其 org 尚未归属租户（子查询返 NULL → 不误伤但也**漏计**）→ 物化系统性少算 →
 * 席位闸 fail-open。故并挂 `organization AFTER UPDATE OF tenantId` 触发器：org 重链时按其当前成员数
 * 从旧租 `−N` 移入新租 `+N`（NULL→X 即盖租时点补计建租者）·两路合守物化恒等不变式。
 *
 * `--fresh`（schema.drop 后 migrator.up **重放**）使本迁移内定义的函数/触发器在 fresh/up/生产链一致存活
 * （物化机制可行性前提·见 tooling §4.10 部署对拍）。存量先 `DEFAULT 0` 落地再**一次性回填**（回填在触发器
 * 创建**之前**·不被双计）。读侧 `MikroQuotaStore.countMembers` 改直读物化列；两跳联表降为 `reconcileMembers`
 * （doctor/恒等对拍·漂移即报警）。
 */
export class Migration20261027023319_tenant_member_count_materialized extends Migration {
  override name = 'Migration20261027023319_tenant_member_count_materialized';

  override up(): void | Promise<void> {
    // 1) 加列（NOT NULL DEFAULT 0·纯 additive·存量先归零再回填）。
    this.addSql(`alter table "tenant" add "memberCount" int not null default 0;`);

    // 2) 一次性回填：按 organization.tenantId → member 两跳联表求各租真实成员数（建初始不变式）。
    this.addSql(`
      update "tenant" t set "memberCount" = coalesce((
        select count(*)
        from "member" m
        join "organization" o on o."id" = m."organizationId"
        where o."tenantId" = t."id"
      ), 0);
    `);

    // 3a) member 增删物化函数：经其 organization 当前 tenantId 派生租户·对 `tenant.memberCount` 增量 ±1。
    //     org.tenantId 为 NULL（尚未盖租）时子查询无匹配 → `where id = NULL` 命中零行·安全跳过（不误伤）。
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

    // 3b) organization 重链物化函数：`tenantId` 变更时，该 org 名下**全部**成员从旧租移向新租（补治写入顺序隐患——
    //     建租者 member 早于 tenantId 盖章插入·于此刻 −0/+N 补计）。org 硬删经 FK 级联清 member·各自触发 −1·故不挂 DELETE。
    this.addSql(`
      create or replace function "tenant_member_count_on_org_relink"() returns trigger
      language plpgsql as $$
      declare
        n int;
      begin
        if old."tenantId" is distinct from new."tenantId" then
          select count(*) into n from "member" where "organizationId" = new."id";
          if old."tenantId" is not null then
            update "tenant" set "memberCount" = "memberCount" - n where "id" = old."tenantId";
          end if;
          if new."tenantId" is not null then
            update "tenant" set "memberCount" = "memberCount" + n where "id" = new."tenantId";
          end if;
        end if;
        return new;
      end;
      $$;
    `);
    this.addSql(`
      create trigger "organization_tenant_relink_count_sync"
      after update of "tenantId" on "organization"
      for each row execute function "tenant_member_count_on_org_relink"();
    `);
  }

  override down(): void | Promise<void> {
    // 逆序拆除：先摘触发器（停止维护）→ 删函数 → 删列（触发器依赖函数、函数依赖列语义·逐层解绑）。
    this.addSql(`drop trigger if exists "member_tenant_count_sync" on "member";`);
    this.addSql(
      `drop trigger if exists "organization_tenant_relink_count_sync" on "organization";`,
    );
    this.addSql(`drop function if exists "tenant_member_count_on_member"();`);
    this.addSql(`drop function if exists "tenant_member_count_on_org_relink"();`);
    this.addSql(`alter table "tenant" drop column "memberCount";`);
  }
}

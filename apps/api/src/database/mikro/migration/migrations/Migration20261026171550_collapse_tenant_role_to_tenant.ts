import { Migration } from '@mikro-orm/migrations';

/**
 * 角色身份塌缩至纯租级（global-tenant-organization-rehierarchy 片三 K5）。
 *
 * `tenant_role` 去 `organizationId` 盖章列·`tenantId` 收紧 NOT NULL·unique `(organizationId,key)`→
 * `(tenantId,key)`（组织维仅存续于 `tenant_role_audit`·见 rbac.entities 注记）。系片二 K4
 * 「保数据 RENAME + tenantId 维持 nullable 过渡」的收口一步。
 *
 * 塌缩前先做**数据护栏**（非破坏·保数据）：
 *  ① 回填：expand 段历史行 `tenantId` 可空——经其 `organizationId` 关联 `organization.tenantId` 补齐
 *     （片一改锚后新行本就盖 tenantId·此处只兜 expand 段存量）；
 *  ② 去重断言：应用层 `createRole/ensureSystemRoles` 已按 `(tenantId,key)` 去重，塌缩前对 `(tenantId,key)`
 *     重复组**fail-loud 抛错转人工合并**（择最早 createdAt 为存活·`tenant_role_grant.roleId` 重指·余行删）——
 *     绝不用启发式静默合并（防覆盖真实授权事实）。零重复方续建 `unique(tenantId,key)`。
 *
 * ⚠ 真库/生产落库执行前另须人亲签（沿片一/片二 高危纪律·dev/Testcontainers 一次性库演练属标准验证可径跑）。
 */
export class Migration20261026171550_collapse_tenant_role_to_tenant extends Migration {
  override name = 'Migration20261026171550_collapse_tenant_role_to_tenant';

  override up(): void | Promise<void> {
    // ① 回填 tenantId（须在 drop organizationId 之前·借 organization 派生）。
    this.addSql(
      `update "tenant_role" tr set "tenantId" = o."tenantId" from "organization" o where tr."tenantId" is null and tr."organizationId" = o."id" and o."tenantId" is not null;`,
    );
    // ② 去重断言：塌缩前 (tenantId,key) 若仍重复则 fail-loud（回填后仍空 tenantId 亦归此闸拦下·须人工处置）。
    this.addSql(`
      do $$
      declare
        nulls int;
        dups int;
      begin
        select count(*) into nulls from "tenant_role" where "tenantId" is null;
        if nulls > 0 then
          raise exception 'K5 collapse: tenant_role 有 % 行 tenantId 回填后仍为空（无对应 organization.tenantId），须人工归属后再塌缩', nulls;
        end if;
        select count(*) into dups from (
          select "tenantId", "key" from "tenant_role" group by "tenantId", "key" having count(*) > 1
        ) t;
        if dups > 0 then
          raise exception 'K5 collapse: tenant_role 存在 % 组 (tenantId,key) 重复，须人工合并（存活最早 createdAt 行·grant 重指·余删）后再塌缩', dups;
        end if;
      end $$;
    `);
    // ③ 结构塌缩：去 org 维（FK + unique）→ 去列 → tenantId NOT NULL → 建租级 unique。
    this.addSql(`alter table "tenant_role" drop constraint "tenant_role_organizationId_foreign";`);
    this.addSql(`alter table "tenant_role" drop constraint "tenant_role_org_key_idx";`);
    this.addSql(`alter table "tenant_role" drop column "organizationId";`);
    this.addSql(`alter table "tenant_role" alter column "tenantId" set not null;`);
    this.addSql(
      `alter table "tenant_role" add constraint "tenant_role_tenant_key_idx" unique ("tenantId", "key");`,
    );
  }

  override down(): void | Promise<void> {
    // 反向（dev 回滚口径·尽力而为）：撤租级 unique → tenantId 归可空 → 重加 organizationId 盖章列并回填
    // （借组织归属·一租户多组织时取任一代表组织·无法还原逐行原始归属·合并掉的 grants 不可逆·标注见头注）。
    this.addSql(`alter table "tenant_role" drop constraint "tenant_role_tenant_key_idx";`);
    this.addSql(`alter table "tenant_role" alter column "tenantId" drop not null;`);
    this.addSql(`alter table "tenant_role" add column "organizationId" text;`);
    this.addSql(`
      update "tenant_role" tr set "organizationId" = o."id"
      from "organization" o
      where o."id" = (
        select o2."id" from "organization" o2
        where o2."tenantId" = tr."tenantId" or o2."id" = tr."tenantId"
        order by o2."createdAt" asc
        limit 1
      );
    `);
    // 无法回填归属的行在重建 NOT NULL 前剔除（dev 演练库一般 0 行·生产勿回滚此迁移）。
    this.addSql(`delete from "tenant_role" where "organizationId" is null;`);
    this.addSql(`alter table "tenant_role" alter column "organizationId" set not null;`);
    this.addSql(
      `alter table "tenant_role" add constraint "tenant_role_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant_role" add constraint "tenant_role_org_key_idx" unique ("organizationId", "key");`,
    );
  }
}

import { Migration } from '@mikro-orm/migrations';

/**
 * global-governance-lifecycle-consolidation 切片 B · **归列 + 数据回填 + 撤旁表**（人裁·整案 GO 2026-10-23，
 * schema 双 DROP+加列系三重高危之一，dev apply 已含于签核）——把租户治理生命周期态从自有 `tenant` 旁表
 * **归位 BA `organization.status` 真列**，并 DROP `tenant` 旁表。**逆** global-tenant-entity-reclamation
 * 切片 A/B（当初「收权入自有表」的两柱已被新约束抽掉：BA 锁死 + 治理面撤「回放即真相」）。
 *
 * 语义等价律（迁移前后租户态逐行核·dev 实跑对拍）：
 *  1. `organization` 先加 `status text NOT NULL DEFAULT 'active'` + 值域 CHECK `organization_status_check`
 *     （表达式与 `tenant_status_check` 同字面量·BA 表共享·additive 自撰域列·红线仅「不删/不改 BA 约定列」）；
 *  2. **回填先于 DROP**：`update ... set status = t.status from tenant t where t.id = o.id`——旁表逐行原值
 *     搬入真列（`pending_approval` 等四态保留）；未命中旁表的 org（存量/seeded·旧无户籍）留列默认 `active`，
 *     与旧 `effectiveStatus` 兑底、deny-list「无状态记录不拦」、`canTransition` 缺省视同 active **三处逐字同论**
 *     （故本回填 = 旧读面终值的物化·缺席态 O1 fail-open 就此闭合）；
 *  3. 归位完成后 DROP `tenant`（连带其 FK 与 `tenant_status_check`·`cascade` 吞子约束）。
 *
 * 值域清单固化字面量（迁移工件系历史快照·上游 `TENANT_STATUS` 若变由后续新迁移演进，不回写本工件）。
 * 顺序即正确性：若先 DROP 后加列，旁表 `pending_approval` 态将随表灭失、被列默认 `active` 掩埋。
 */
export class Migration20261023093000_consolidate_tenant_status_into_organization extends Migration {
  override name = 'Migration20261023093000_consolidate_tenant_status_into_organization';

  override up(): void | Promise<void> {
    // 1) organization 先加 status 真列（NOT NULL DEFAULT 'active'）+ 值域 CHECK
    this.addSql(`alter table "organization" add column "status" text not null default 'active';`);
    this.addSql(
      `alter table "organization" add constraint "organization_status_check" check (status IN ('pending_approval', 'active', 'suspended', 'deleted'));`,
    );

    // 2) 回填：从旧 tenant 旁表逐行搬 status（未命中行留列默认 'active'·等值于旧 effectiveStatus 兑底）
    this.addSql(
      `update "organization" o set "status" = t."status" from "tenant" t where t."id" = o."id";`,
    );

    // 3) 归位完成 → DROP 旁表（连带 tenant_status_check + FK·cascade）
    this.addSql(`drop table if exists "tenant" cascade;`);
  }

  override down(): void | Promise<void> {
    // 尽力而为（dev 回滚口径·无存量生产）：重建 tenant 旁表 → 反向回填 organization.status → 剥离列。
    this.addSql(
      `create table "tenant" ("id" text not null, "status" text not null, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "tenant" add constraint "tenant_id_foreign" foreign key ("id") references "organization" ("id") on update no action on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant" add constraint "tenant_status_check" check (status IN ('pending_approval', 'active', 'suspended', 'deleted'));`,
    );

    // 反向回填：为每个 org 落户籍行（近似·旧「无户籍」态在 down 无从复原·统一成有行·回滚仅取开发可用）
    this.addSql(
      `insert into "tenant" ("id", "status", "createdAt") select o."id", o."status", coalesce(o."createdAt", now()) from "organization" o;`,
    );

    this.addSql(`alter table "organization" drop constraint "organization_status_check";`);
    this.addSql(`alter table "organization" drop column "status";`);
  }
}

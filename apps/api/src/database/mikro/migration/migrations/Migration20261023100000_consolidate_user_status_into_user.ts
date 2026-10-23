import { Migration } from '@mikro-orm/migrations';

/**
 * global-governance-lifecycle-consolidation 切片 C · **归列 + 数据回填 + 撤旁表**（人裁·整案 GO 2026-10-23，
 * schema 双 DROP+加列系三重高危之一，dev apply 已含于签核）——把用户治理生命周期态从自有 `user_status` 旁表
 * **归位 BA `user.status` 真列 + `user.statusReason`**，并 DROP `user_status` 旁表。沿切片 B（tenant→organization）
 * 同型律：BA 表共享·additive 自撰域列·红线仅「不删/改 BA 约定列」；治理写经 AUTH_USER_STORE 端口落 auth 属主。
 *
 * 语义等价律（迁移前后用户态逐行核·dev 实跑对拍）：
 *  1. `user` 先加 `status text NOT NULL DEFAULT 'active'` + `statusReason text NULL` + 值域 CHECK
 *     `user_status_check`（IN ('active','suspended','deleted')·USER_STATUS 三态子集·pending 属租户准入不入用户）；
 *  2. **回填先于 DROP**：`update ... set status=s.status, statusReason=s.reason from user_status s where s.userId=u.id`
 *     ——旁表逐行原值搬入真列（suspended/deleted 态保留）；未命中旁表的 user（存量/未被动过暂停）留列默认 `active`，
 *     与旧 deny-list「无记录行视同 active」逐字同论（故本回填 = 旧读面终值的物化·缺席态 fail-open 就此闭合）；
 *  3. 归位完成后 DROP `user_status`（连带其 PK/FK `user_status_userId_foreign`·`cascade` 吞子约束）。
 *
 * 值域清单固化字面量（迁移工件系历史快照·上游 `USER_STATUS` 若变由后续新迁移演进，不回写本工件）。
 * 顺序即正确性：若先 DROP 后加列，旁表 suspended/deleted 态将随表灭失、被列默认 `active` 掩埋。
 * 时间戳取 20261023100000（> 切片 B 20261023093000·保迁移链单调）。
 */
export class Migration20261023100000_consolidate_user_status_into_user extends Migration {
  override name = 'Migration20261023100000_consolidate_user_status_into_user';

  override up(): void | Promise<void> {
    // 1) user 先加 status/statusReason 真列 + 值域 CHECK
    this.addSql(`alter table "user" add column "status" text not null default 'active';`);
    this.addSql(`alter table "user" add column "statusReason" text null;`);
    this.addSql(
      `alter table "user" add constraint "user_status_check" check (status IN ('active', 'suspended', 'deleted'));`,
    );

    // 2) 回填：从旧 user_status 旁表逐行搬 status/reason（未命中行留列默认 'active'·等值于旧 deny-list 兑底）
    this.addSql(
      `update "user" u set "status" = s."status", "statusReason" = s."reason" from "user_status" s where s."userId" = u."id";`,
    );

    // 3) 归位完成 → DROP 旁表（连带 PK/FK·cascade）
    this.addSql(`drop table if exists "user_status" cascade;`);
  }

  override down(): void | Promise<void> {
    // 尽力而为（dev 回滚口径·无存量生产）：重建 user_status 旁表 → 反向回填 user.status → 剥离列。
    this.addSql(
      `create table "user_status" ("userId" text not null, "status" text not null, "reason" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("userId"));`,
    );
    this.addSql(
      `alter table "user_status" add constraint "user_status_userId_foreign" foreign key ("userId") references "user" ("id") on update no action on delete cascade;`,
    );

    // 反向回填：仅为「被治理过」的 user 落户籍行（status<>'active'·近似旧稀疏语义·回滚仅取开发可用）
    this.addSql(
      `insert into "user_status" ("userId", "status", "reason", "createdAt", "updatedAt") select u."id", u."status", u."statusReason", u."createdAt", u."updatedAt" from "user" u where u."status" <> 'active';`,
    );

    this.addSql(`alter table "user" drop constraint "user_status_check";`);
    this.addSql(`alter table "user" drop column "status", drop column "statusReason";`);
  }
}

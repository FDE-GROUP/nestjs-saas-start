import { Migration } from '@mikro-orm/migrations';

/**
 * module-session-index-and-expiry-reclaim F1（高危#1 DB 迁移·人「同意 GO·亲签迁移」2026-10-20）：
 * session 表补两索引——`session_token_idx`（unique·终结 BA 每请求按 token 全表 seq scan·兼完整性防线）
 * + `session_expires_at_idx`（供过期 session 回收谓词 `expiresAt < now` 命中索引）。纯 additive·零列形变更。
 */
export class Migration20261020150833 extends Migration {
  override name = 'Migration20261020150833';

  override up(): void | Promise<void> {
    this.addSql(`create index "session_expires_at_idx" on "session" ("expiresAt");`);
    this.addSql(`alter table "session" add constraint "session_token_idx" unique ("token");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "session_expires_at_idx";`);
    this.addSql(`alter table "session" drop constraint "session_token_idx";`);
  }
}

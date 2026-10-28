import { Migration } from '@mikro-orm/migrations';

export class Migration20261028131045_add_mcp_access_token extends Migration {
  override name = 'Migration20261028131045_add_mcp_access_token';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "mcp_access_token" ("id" text not null, "tenantId" text not null, "userId" text not null, "name" text not null, "tokenHash" text not null, "tokenPrefix" text not null, "scopes" jsonb not null, "expiresAt" timestamp not null, "lastUsedAt" timestamp null, "revokedAt" timestamp null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );
    this.addSql(`create index "mcp_access_token_tenant_idx" on "mcp_access_token" ("tenantId");`);
    this.addSql(`create index "mcp_access_token_user_idx" on "mcp_access_token" ("userId");`);
    this.addSql(
      `alter table "mcp_access_token" add constraint "mcp_access_token_hash_idx" unique ("tokenHash");`,
    );
    this.addSql(
      `alter table "mcp_access_token" add constraint "mcp_access_token_tenantId_foreign" foreign key ("tenantId") references "tenant" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "mcp_access_token" add constraint "mcp_access_token_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "mcp_access_token" cascade;`);
  }
}

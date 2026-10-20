import { Migration } from '@mikro-orm/migrations';

export class Migration20261020075523_add_tenant_table extends Migration {
  override name = 'Migration20261020075523_add_tenant_table';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "tenant" ("id" text not null, "status" text not null, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );

    this.addSql(
      `alter table "tenant" add constraint "tenant_id_foreign" foreign key ("id") references "organization" ("id") on update no action on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant" add constraint "tenant_status_check" check (status IN ('pending_approval', 'active', 'suspended', 'deleted'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "tenant" cascade;`);
  }
}

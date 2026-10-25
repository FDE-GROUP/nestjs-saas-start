import { Migration } from '@mikro-orm/migrations';

/**
 * module-org-odoo-company-mapping 切片 A —— `organization` 加 Odoo 公司绑定列组（纯 additive）：
 * `odooCompanyId`（跨库弱引用·无 FK）+ unique（一租户一公司双射库级兜底）+
 * `odooBindingStatus`（具名 CHECK 值域·NULL=未绑定）+ 名称快照/绑定时间/失败原因。
 * 存量行全部落 NULL（未绑定态），`canUseOdoo` fail-closed 自然拒，经 bind-existing/回填通道转 ready。
 *
 * CHECK 表达式列名带引号：驼峰列实存为 "odooBindingStatus"，裸写会被 PG 折叠小写（首版 generate
 * 由未引号声明产生、apply 时 errorMissingColumn 回滚，本件系声明修正后重生成）。
 */
export class Migration20261025224650_odoo_company_binding extends Migration {
  override name = 'Migration20261025224650_odoo_company_binding';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "organization" add "odooCompanyId" int null, add "odooBindingStatus" text null, add "odooCompanyName" text null, add "odooBoundAt" timestamp null, add "odooFailureReason" text null;`,
    );
    this.addSql(
      `alter table "organization" add constraint "organization_odooCompanyId_unique" unique ("odooCompanyId");`,
    );
    this.addSql(
      `alter table "organization" add constraint "organization_odoo_binding_status_check" check ("odooBindingStatus" IN ('pending', 'provisioning', 'ready', 'failed'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "organization" drop constraint "organization_odooCompanyId_unique";`);
    this.addSql(
      `alter table "organization" drop constraint "organization_odoo_binding_status_check";`,
    );
    this.addSql(
      `alter table "organization" drop column "odooCompanyId", drop column "odooBindingStatus", drop column "odooCompanyName", drop column "odooBoundAt", drop column "odooFailureReason";`,
    );
  }
}

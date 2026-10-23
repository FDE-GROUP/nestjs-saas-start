import { Migration } from '@mikro-orm/migrations';

/**
 * RBAC 三表更名 `tenant_role* → organization_role*`（global-organization-vocabulary-pivot 切片 B）。
 *
 * ⚠ 本工件系 `migration:generate` 产物（DROP+CREATE 形态）经**人工改写为保数据 RENAME**——
 * generate 无法识别 rename 属案 §5 已登记推断，本文件即人审工件。表/约束/索引/序列全部
 * rename，数据零动。历史工件 `Migration20261016205324_add_rbac_dynamic_roles` 不改（档案如实）。
 *
 * 落库执行（dev `migration:run` / `db:reset`）按案须人亲签后方可进行。
 */
export class Migration20261023120000_rename_tenant_role_to_organization extends Migration {
  override name = 'Migration20261023120000_rename_tenant_role_to_organization';

  override up(): void | Promise<void> {
    this.addSql(`alter table "tenant_role" rename to "organization_role";`);
    this.addSql(`alter table "tenant_role_grant" rename to "organization_role_grant";`);
    this.addSql(`alter table "tenant_role_audit" rename to "organization_role_audit";`);

    // PG 表 rename 不带走约束/索引/序列名——逐一对齐实体元数据新名（防下次 generate 假差）。
    this.addSql(
      `alter table "organization_role" rename constraint "tenant_role_pkey" to "organization_role_pkey";`,
    );
    this.addSql(
      `alter table "organization_role" rename constraint "tenant_role_org_key_idx" to "organization_role_org_key_idx";`,
    );
    this.addSql(
      `alter table "organization_role" rename constraint "tenant_role_organizationId_foreign" to "organization_role_organizationId_foreign";`,
    );

    this.addSql(
      `alter table "organization_role_grant" rename constraint "tenant_role_grant_pkey" to "organization_role_grant_pkey";`,
    );
    this.addSql(
      `alter table "organization_role_grant" rename constraint "tenant_role_grant_roleId_foreign" to "organization_role_grant_roleId_foreign";`,
    );
    this.addSql(
      `alter index "tenant_role_grant_role_subject_idx" rename to "organization_role_grant_role_subject_idx";`,
    );
    this.addSql(
      `alter sequence "tenant_role_grant_id_seq" rename to "organization_role_grant_id_seq";`,
    );

    this.addSql(
      `alter table "organization_role_audit" rename constraint "tenant_role_audit_pkey" to "organization_role_audit_pkey";`,
    );
    this.addSql(
      `alter table "organization_role_audit" rename constraint "tenant_role_audit_organizationId_foreign" to "organization_role_audit_organizationId_foreign";`,
    );
    this.addSql(
      `alter table "organization_role_audit" rename constraint "tenant_role_audit_actorId_foreign" to "organization_role_audit_actorId_foreign";`,
    );
    this.addSql(
      `alter index "tenant_role_audit_org_created_idx" rename to "organization_role_audit_org_created_idx";`,
    );
    this.addSql(
      `alter sequence "tenant_role_audit_id_seq" rename to "organization_role_audit_id_seq";`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter sequence "organization_role_audit_id_seq" rename to "tenant_role_audit_id_seq";`,
    );
    this.addSql(
      `alter index "organization_role_audit_org_created_idx" rename to "tenant_role_audit_org_created_idx";`,
    );
    this.addSql(
      `alter table "organization_role_audit" rename constraint "organization_role_audit_actorId_foreign" to "tenant_role_audit_actorId_foreign";`,
    );
    this.addSql(
      `alter table "organization_role_audit" rename constraint "organization_role_audit_organizationId_foreign" to "tenant_role_audit_organizationId_foreign";`,
    );
    this.addSql(
      `alter table "organization_role_audit" rename constraint "organization_role_audit_pkey" to "tenant_role_audit_pkey";`,
    );
    this.addSql(
      `alter sequence "organization_role_grant_id_seq" rename to "tenant_role_grant_id_seq";`,
    );
    this.addSql(
      `alter index "organization_role_grant_role_subject_idx" rename to "tenant_role_grant_role_subject_idx";`,
    );
    this.addSql(
      `alter table "organization_role_grant" rename constraint "organization_role_grant_roleId_foreign" to "tenant_role_grant_roleId_foreign";`,
    );
    this.addSql(
      `alter table "organization_role_grant" rename constraint "organization_role_grant_pkey" to "tenant_role_grant_pkey";`,
    );
    this.addSql(
      `alter table "organization_role" rename constraint "organization_role_organizationId_foreign" to "tenant_role_organizationId_foreign";`,
    );
    this.addSql(
      `alter table "organization_role" rename constraint "organization_role_org_key_idx" to "tenant_role_org_key_idx";`,
    );
    this.addSql(
      `alter table "organization_role" rename constraint "organization_role_pkey" to "tenant_role_pkey";`,
    );

    this.addSql(`alter table "organization_role_audit" rename to "tenant_role_audit";`);
    this.addSql(`alter table "organization_role_grant" rename to "tenant_role_grant";`);
    this.addSql(`alter table "organization_role" rename to "tenant_role";`);
  }
}

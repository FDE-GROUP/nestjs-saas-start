import { Migration } from '@mikro-orm/migrations';

/**
 * RBAC 三表复原更名 `organization_role* → tenant_role*`（global-tenant-organization-rehierarchy 片二 K4）。
 *
 * 系 vocabulary-pivot 那次 `Migration20261023120000_rename_tenant_role_to_organization` 的**反向改名**——
 * 逐一对齐表/约束/索引/序列名（含切片 B 后加的 `tenantId` FK 约束）·**数据零动**。片二 K4 仅复原命名：
 * `tenant_role/tenant_role_audit.tenantId` **维持 nullable**（角色身份塌缩至纯租级——去 org 列·
 * unique→(tenantId,key)——另案 K5·本片不做 DB 级 NOT NULL 收紧）。
 *
 * ⚠ 真库/生产落库执行前另须人亲签（沿片一高危纪律·dev/Testcontainers 一次性库演练属标准验证可径跑）。
 */
export class Migration20261026161000_rename_organization_role_to_tenant extends Migration {
  override name = 'Migration20261026161000_rename_organization_role_to_tenant';

  override up(): void | Promise<void> {
    // 表名复原：PG 表 rename 不带走约束/索引/序列名——逐一对齐实体元数据新名（防下次 generate 假差）。
    this.addSql(`alter table "organization_role" rename to "tenant_role";`);
    this.addSql(`alter table "organization_role_grant" rename to "tenant_role_grant";`);
    this.addSql(`alter table "organization_role_audit" rename to "tenant_role_audit";`);

    this.addSql(
      `alter table "tenant_role" rename constraint "organization_role_pkey" to "tenant_role_pkey";`,
    );
    this.addSql(
      `alter table "tenant_role" rename constraint "organization_role_org_key_idx" to "tenant_role_org_key_idx";`,
    );
    this.addSql(
      `alter table "tenant_role" rename constraint "organization_role_organizationId_foreign" to "tenant_role_organizationId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role" rename constraint "organization_role_tenantId_foreign" to "tenant_role_tenantId_foreign";`,
    );

    this.addSql(
      `alter table "tenant_role_grant" rename constraint "organization_role_grant_pkey" to "tenant_role_grant_pkey";`,
    );
    this.addSql(
      `alter table "tenant_role_grant" rename constraint "organization_role_grant_roleId_foreign" to "tenant_role_grant_roleId_foreign";`,
    );
    this.addSql(
      `alter index "organization_role_grant_role_subject_idx" rename to "tenant_role_grant_role_subject_idx";`,
    );
    this.addSql(
      `alter sequence "organization_role_grant_id_seq" rename to "tenant_role_grant_id_seq";`,
    );

    this.addSql(
      `alter table "tenant_role_audit" rename constraint "organization_role_audit_pkey" to "tenant_role_audit_pkey";`,
    );
    this.addSql(
      `alter table "tenant_role_audit" rename constraint "organization_role_audit_organizationId_foreign" to "tenant_role_audit_organizationId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role_audit" rename constraint "organization_role_audit_actorId_foreign" to "tenant_role_audit_actorId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role_audit" rename constraint "organization_role_audit_tenantId_foreign" to "tenant_role_audit_tenantId_foreign";`,
    );
    this.addSql(
      `alter index "organization_role_audit_org_created_idx" rename to "tenant_role_audit_org_created_idx";`,
    );
    this.addSql(
      `alter sequence "organization_role_audit_id_seq" rename to "tenant_role_audit_id_seq";`,
    );
  }

  override down(): void | Promise<void> {
    // 反向：先逐一对齐约束/索引/序列旧名（表仍名 tenant_role*），末了再翻表名。
    this.addSql(
      `alter sequence "tenant_role_audit_id_seq" rename to "organization_role_audit_id_seq";`,
    );
    this.addSql(
      `alter index "tenant_role_audit_org_created_idx" rename to "organization_role_audit_org_created_idx";`,
    );
    this.addSql(
      `alter table "tenant_role_audit" rename constraint "tenant_role_audit_actorId_foreign" to "organization_role_audit_actorId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role_audit" rename constraint "tenant_role_audit_tenantId_foreign" to "organization_role_audit_tenantId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role_audit" rename constraint "tenant_role_audit_organizationId_foreign" to "organization_role_audit_organizationId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role_audit" rename constraint "tenant_role_audit_pkey" to "organization_role_audit_pkey";`,
    );
    this.addSql(
      `alter sequence "tenant_role_grant_id_seq" rename to "organization_role_grant_id_seq";`,
    );
    this.addSql(
      `alter index "tenant_role_grant_role_subject_idx" rename to "organization_role_grant_role_subject_idx";`,
    );
    this.addSql(
      `alter table "tenant_role_grant" rename constraint "tenant_role_grant_roleId_foreign" to "organization_role_grant_roleId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role_grant" rename constraint "tenant_role_grant_pkey" to "organization_role_grant_pkey";`,
    );
    this.addSql(
      `alter table "tenant_role" rename constraint "tenant_role_tenantId_foreign" to "organization_role_tenantId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role" rename constraint "tenant_role_organizationId_foreign" to "organization_role_organizationId_foreign";`,
    );
    this.addSql(
      `alter table "tenant_role" rename constraint "tenant_role_org_key_idx" to "organization_role_org_key_idx";`,
    );
    this.addSql(
      `alter table "tenant_role" rename constraint "tenant_role_pkey" to "organization_role_pkey";`,
    );

    this.addSql(`alter table "tenant_role_audit" rename to "organization_role_audit";`);
    this.addSql(`alter table "tenant_role_grant" rename to "organization_role_grant";`);
    this.addSql(`alter table "tenant_role" rename to "organization_role";`);
  }
}

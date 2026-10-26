import { Migration } from '@mikro-orm/migrations';

/**
 * 第三次层级复裁 · 切片 3（D2/评审 pt1）：`tenant` 加租内跨组织可见性策略列 `orgVisibility`。
 *
 * 纯 additive：`NOT NULL DEFAULT 'shared'` ⇒ 存量行全取 `shared`（与上一轮 vision「同租内跨组织默认互见」
 * 逐字节等价·零行为变更）；`isolated` 为每租户显式 opt-in，经切片 1 全局 filter 于租内追加 `organizationId`
 * 收窄。跨租硬地板 `tenantId` 不受本列影响。值域 CHECK ∈{shared,isolated} 由 `ORG_VISIBILITY` 单源生成（列名加双引号
 * 保 camelCase 物理列·否则 PG 折叠小写致约缺失）。Migration 名为纯 ADD·可回滚（drop constraint + drop column）。
 */
export class Migration20261026192848_tenant_org_visibility extends Migration {
  override name = 'Migration20261026192848_tenant_org_visibility';

  override up(): void | Promise<void> {
    this.addSql(`alter table "tenant" add "orgVisibility" text not null default 'shared';`);
    this.addSql(
      `alter table "tenant" add constraint "tenant_org_visibility_check" check ("orgVisibility" IN ('shared', 'isolated'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "tenant" drop constraint "tenant_org_visibility_check";`);
    this.addSql(`alter table "tenant" drop column "orgVisibility";`);
  }
}

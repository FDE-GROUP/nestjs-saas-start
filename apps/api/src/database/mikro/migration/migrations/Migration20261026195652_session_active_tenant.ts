import { Migration } from '@mikro-orm/migrations';

/**
 * 第三次层级复裁 · 切片 4（D7/评审 pt3）：`session` 加独立租级激活位 `activeTenantId`（租户激活解绑）。
 *
 * 纯 additive·nullable：`NULL` = 会话未显式选租 → 中间件回落经 `activeOrganizationId` 派生主轴 `tenantId`
 *（向后兼容·既有 BA activeOrganizationId 机制不删）。非 NULL 时中间件优先以其绑租上下文，令无活动组织的
 * 租成员亦可达租级端点（计费/席位/目录·解「org 绑架」）。本列仅服务端写（BA `input:false`），且写前必校验
 * 目标租户的成员资格（防跨租提权）。`tenantId` 跨租硬地板语义不变。
 */
export class Migration20261026195652_session_active_tenant extends Migration {
  override name = 'Migration20261026195652_session_active_tenant';

  override up(): void | Promise<void> {
    this.addSql(`alter table "session" add "activeTenantId" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "session" drop column "activeTenantId";`);
  }
}

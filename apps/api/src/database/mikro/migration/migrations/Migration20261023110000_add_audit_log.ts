import { Migration } from '@mikro-orm/migrations';

/**
 * global-governance-lifecycle-consolidation 切片 E · **立治理审计耐久账本**（人裁·整案 GO 2026-10-23·
 * 约束③「审计另立显式 `audit_log` 表·不复用事件流」；新建表系纯 additive·无 DROP·schema 面已在整案亲签内）
 * ——治理生命周期动作（approve/reject/suspend/resume/soft-delete/hard_delete + user suspend/resume/delete）
 * 从此前「仅 pino 结构化日志」演进为**同时落 `audit_log` 耐久账本**（可查询/导出）。
 *
 * 对拍 `tenant_role_audit` 既有审计先例（同 append-only·同 actorId→user `on delete set null` 令留痕不因
 * 操作者消亡而丢）。差异：本表 `entityId` 系**多态裸值**（`tenant`|`user` 两域共用一列·非 FK）——被治理
 * 实体被硬删（reject 灭 org / PIPL 灭 user）后账行仍幸存，是「存在过并被治理」的耐久痕迹（合 §3-R4）。
 *
 * 列形承实体元数据单源 `AUDIT_LOG_META`（`migration-entities.ts` 经 `buildMigrationEntity` 派生·DDL 恒等）：
 * 迁移端点物理列采非保留字 `fromStatus`/`toStatus`（沿 `before/after` 避 SQL 关键字先例）。append-only ⇒
 * 无 `updatedAt`（入 `IMMUTABLE_TABLES`·L1 豁免为设计而非缺失）。PII 最小化：仅裸 id·无 email。
 *
 * 时间戳取 20261023110000（> 切片 C 20261023100000·保迁移链单调）。
 */
export class Migration20261023110000_add_audit_log extends Migration {
  override name = 'Migration20261023110000_add_audit_log';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "audit_log" ("id" bigserial primary key, "entityType" text not null, "entityId" text not null, "action" text not null, "fromStatus" text null, "toStatus" text null, "actorId" text null, "reason" text null, "correlationId" text null, "createdAt" timestamp not null default now());`,
    );
    this.addSql(
      `create index "audit_log_entity_created_idx" on "audit_log" ("entityType", "entityId", "createdAt");`,
    );
    this.addSql(
      `alter table "audit_log" add constraint "audit_log_actorId_foreign" foreign key ("actorId") references "user" ("id") on delete set null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "audit_log" cascade;`);
  }
}

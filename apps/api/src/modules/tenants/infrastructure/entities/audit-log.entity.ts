import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `audit_log` 表列元数据单源 + 运行时扁平实体（global-governance-lifecycle-consolidation 切片 E·
 * 人裁 2026-10-23·约束③「审计另立显式 `audit_log` 表·不复用事件流」）。
 *
 * 治理生命周期（approve/reject/suspend/resume/soft-delete + user suspend/resume/delete）的
 * **耐久审计账本**：对拍 `tenant_role_audit` 既有审计先例（同 append-only·同 actorId FK→User
 * `set null` 令留痕不因操作者消亡而丢）。`table-ownership.ts` 判 `auditLog→tenants`（§3 裁点③
 * 属主=tenants 起步），故本实体居 `modules/tenants/**`，唯一写通道 = `MikroAuditLogStore`（经
 * core `AUDIT_LOG_STORE` 端口·由治理审计单点 `PlatformAuditService` 消费）。
 *
 * **PII 最小化**（人裁·仅 id·不携邮箱）：`entityId`/`actorId` 皆裸标识符；`entityId` 系**多态裸值**
 * （非 FK·`tenant`|`user` 两域共用一列）——被治理实体被硬删后（reject 灭 org / PIPL 灭 user），
 * 账行仍幸存，是「存在过并被治理」的耐久痕迹。
 * **append-only**：无 `updatedAt`（只插不改不删·入 `IMMUTABLE_TABLES`·L1 豁免为设计而非缺失）。
 * 迁移端点列采非保留字物理名 `fromStatus`/`toStatus`（沿 `before`/`after` 避 SQL 关键字先例·
 * 端口 `AuditLogEntry.from/to` 系 TS 面语义名，适配层做映射）。
 * ⚠ tsx 消费链（迁移装配）文件一律**相对导入**（`@app` 别名 tsx 不解析）。
 */
export const AUDIT_LOG_META: TableMeta = {
  name: 'AuditLog',
  tableName: 'audit_log',
  columns: [
    ['id', { k: 'bigintAutoPk' }],
    // 'tenant' | 'user'（AuditEntityKind·值域由 core 端口 TS 单源约束·对拍先例不加 DB CHECK）。
    ['entityType', { k: 'text' }],
    ['entityId', { k: 'text' }],
    // approve/reject/suspend/resume/delete/hard_delete。
    ['action', { k: 'text' }],
    ['fromStatus', { k: 'text', nullable: true }],
    ['toStatus', { k: 'text', nullable: true }],
    // 操作者可删：set null 留账行本体（留痕不因 actor 消亡而丢·沿 tenant_role_audit）。
    ['actorId', { k: 'fk', target: 'User', onDelete: 'set null', nullable: true }],
    ['reason', { k: 'text', nullable: true }],
    ['correlationId', { k: 'text', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
  ],
  // 账本按实体回溯（某 tenant/user 的全部治理动作时序）。
  indexes: [
    { name: 'audit_log_entity_created_idx', properties: ['entityType', 'entityId', 'createdAt'] },
  ],
};

export interface AuditLogRow {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  /** 操作者 id（可空·actor 消亡后 set null 留账行本体）。 */
  actorId: string | null;
  reason: string | null;
  /** 关联 id（请求链·后台/脚本调用落 null）。 */
  correlationId: string | null;
  createdAt: Date;
}
export const AuditLog: EntitySchema<AuditLogRow> = buildRuntimeEntity(
  AUDIT_LOG_META,
) as EntitySchema<AuditLogRow>;

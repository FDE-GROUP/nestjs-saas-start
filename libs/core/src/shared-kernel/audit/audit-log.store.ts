/**
 * 治理审计账本持久化端口的 DI 注入 token（global-governance-lifecycle-consolidation 切片 E · 人裁 2026-10-23）。
 *
 * @remarks
 * 治理动作（approve/reject/suspend/resume/soft-delete + user suspend/resume/delete）的**耐久审计
 * 账本**持久化抽象。约束③「审计另立显式 `audit_log` 表（不复用事件流）」——本端口不感知表形，
 * 适配在参考应用实现（居 `modules/organizations/**`·`audit_log` 属主=tenants·见 §3 裁点③），
 * 由治理审计单点 `PlatformAuditService`（core）消费（端口倒置·沿 `USER_STATUS_STORE` 先例）。
 *
 * **PII 最小化**（人裁·仅 id·不携邮箱）：条目只承载被治理实体/操作者的**标识符**与动作语义，
 * 严禁落 email/姓名等个人数据；`entityId` 系多态裸值（非 FK），故实体被硬删后账行仍幸存
 * （对齐 `organization_role_audit`「留痕不因本体消亡而丢」先例）。
 *
 * 语义：append-only——只插不改不删（`audit_log` 入 `IMMUTABLE_TABLES`）；本端口只暴露 `append`
 * 单原语，不提供任何 update/delete（耐久账本不可篡改是设计而非缺失）。
 *
 * @public
 */
export const AUDIT_LOG_STORE = Symbol('AUDIT_LOG_STORE');

/**
 * 被治理实体类别（用户/租户治理生命周期态归位后的统一账本维度·多态裸值）。
 *
 * @public
 */
export type AuditEntityKind = 'tenant' | 'user';

/**
 * 一条治理审计账（无 PII·仅 id + 动作 + 状态迁移端点 + 关联链）。
 *
 * @public
 */
export interface AuditLogEntry {
  /** 审计实体类别。 */
  readonly entityType: AuditEntityKind;
  /** 被治理实体 id（organizationId / userId·多态裸值·非 FK·本体硬删后仍留痕）。 */
  readonly entityId: string;
  /** 治理动作名（approve/reject/suspend/resume/delete/hard_delete）。 */
  readonly action: string;
  /** 迁移起态（可空·驳回/硬删无 to）。 */
  readonly from?: string | null;
  /** 迁移止态（可空）。 */
  readonly to?: string | null;
  /** 操作者 id（可空·本体删除后 set null 留账行本体）。 */
  readonly actorId?: string | null;
  /** 治理理由（可空）。 */
  readonly reason?: string | null;
  /** 关联 id（请求链·可空·后台/脚本调用落 null）。 */
  readonly correlationId?: string | null;
}

/**
 * 治理审计账本端口（append-only·只暴露单原语）。
 *
 * @public
 */
export interface AuditLogStore {
  /**
   * 追加一条治理审计账（append-only·只插不改不删）。
   *
   * @param entry - 待落账的审计条目
   */
  append(entry: AuditLogEntry): Promise<void>;
}

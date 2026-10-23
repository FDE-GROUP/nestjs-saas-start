/**
 * 租户生命周期状态机（FR-1 · 方案 §9.4）·纯函数·零框架依赖。
 *
 * 状态存自有 **`tenant.status` 真列**（global-tenant-entity-reclamation 切片 B·人签 2026-10-20：
 * 此前寄居 `organization.metadata` jsonb 的 S4 存储裁定已修订——BA 缩回宪法「纯认证与
 * 成员数据源」定位）。持久化原语经 `OrganizationStatusStore` 端口倒置，本文件只留纯态判定。
 * S4 落地 `pending_approval → active`（审批制准入）；`suspended`/`deleted` 迁移由 S5/S6
 * （经营者治理·fail-closed 暂停）驱动，此处先行定义。
 */
export const ORGANIZATION_STATUS = {
  PENDING: 'pending_approval',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
} as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUS)[keyof typeof ORGANIZATION_STATUS];

/**
 * 拦截判定（S4 中间件失能卡点·deny-list 语义）：仅显式处于
 * `pending_approval` / `suspended` / `deleted` 时拦截。**无状态记录 → 不拦**
 * （兼容存量/seeded 无户籍 org·避免锁定既有 dev 租户）。新申请经申请端点显式打
 * `pending_approval` → 天然失能，FR-1 闭环不受存量影响。
 */
export function isOrganizationBlocked(status: OrganizationStatus | undefined): boolean {
  return (
    status === ORGANIZATION_STATUS.PENDING ||
    status === ORGANIZATION_STATUS.SUSPENDED ||
    status === ORGANIZATION_STATUS.DELETED
  );
}

/**
 * 合法迁移表（§9.4 · S5 收紧）：
 * - pending_approval → active（审批通过）/ deleted（删除 pending）
 * - active → suspended（暂停）/ deleted（软删）；active → active 保留（审批幂等重提）
 * - suspended → active（恢复）/ deleted；deleted 终态（硬删留运维）
 * 无状态记录（存量/seeded 无户籍）按 active 对待（与中间件 deny-list 同口径）。
 */
const TRANSITIONS: Record<OrganizationStatus, readonly OrganizationStatus[]> = {
  [ORGANIZATION_STATUS.PENDING]: [ORGANIZATION_STATUS.ACTIVE, ORGANIZATION_STATUS.DELETED],
  [ORGANIZATION_STATUS.ACTIVE]: [
    ORGANIZATION_STATUS.ACTIVE,
    ORGANIZATION_STATUS.SUSPENDED,
    ORGANIZATION_STATUS.DELETED,
  ],
  [ORGANIZATION_STATUS.SUSPENDED]: [ORGANIZATION_STATUS.ACTIVE, ORGANIZATION_STATUS.DELETED],
  [ORGANIZATION_STATUS.DELETED]: [],
};

/** 迁移是否合法（from 缺省视同 active；终态 deleted 不接受任何迁移）。 */
export function canTransition(
  from: OrganizationStatus | undefined,
  to: OrganizationStatus,
): boolean {
  return TRANSITIONS[from ?? ORGANIZATION_STATUS.ACTIVE].includes(to);
}

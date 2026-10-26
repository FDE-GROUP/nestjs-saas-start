/**
 * 租户生命周期状态词汇（FR-1 · 方案 §9.4）·纯函数·零框架依赖。
 *
 * @remarks
 * 生命周期真相源 = **`tenant.status`**（global-tenant-organization-rehierarchy 片一改锚·人裁 2026-10-26
 * 「一租户多组织」层级 Tenant ⊃ Organization ⊃ Workspace·治理态上移租户级）；`organization.status` 已降为租内
 * 自有轻量态（片二 K1·死服务 `OrganizationStatusService` 退役·不再作治理真相）。本枚举名 `TENANCY_STATUS`（片三
 * 词汇复裁·旧名 `ORGANIZATION_STATUS`·**值域/wire 冻结不变**）；历史曾寄居 `organization.metadata` jsonb/自有旁表
 * 的裁定均已修订（BA 缩回宪法「纯认证与成员数据源」定位）。持久化原语经状态存储端口倒置（治理侧 `TenantStatusStore`·本文件只留纯态判定）。
 * S4 落地 `pending_approval → active`（审批制准入）；`suspended`/`deleted` 迁移由 S5/S6
 * （经营者治理·fail-closed 暂停）驱动，此处先行定义。
 *
 * @public
 */
export const TENANCY_STATUS = {
  PENDING: 'pending_approval',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
} as const;

/** 租户生命周期状态的字面量联合（自 `TENANCY_STATUS` 派生·契约详见该常量）。 @public */
export type TenancyStatus = (typeof TENANCY_STATUS)[keyof typeof TENANCY_STATUS];

/**
 * 拦截判定（S4 中间件失能卡点·deny-list 语义）：仅显式处于失能态时拦截。
 *
 * @remarks
 * 仅 `pending_approval` / `suspended` / `deleted` 时拦截。**无状态记录 → 不拦**
 * （兼容存量/seeded 无状态记录 org·避免锁定既有 dev 租户）。新申请经申请端点显式打
 * `pending_approval` → 天然失能，FR-1 闭环不受存量影响。
 *
 * @param status - 待判定的生命周期状态（可为 undefined）
 * @returns 命中失能态返回 `true`；否则 `false`
 * @public
 */
export function isTenancyBlocked(status: TenancyStatus | undefined): boolean {
  return (
    status === TENANCY_STATUS.PENDING ||
    status === TENANCY_STATUS.SUSPENDED ||
    status === TENANCY_STATUS.DELETED
  );
}

/**
 * 合法迁移表（§9.4 · S5 收紧）：
 * - pending_approval → active（审批通过）/ deleted（删除 pending）
 * - active → suspended（暂停）/ deleted（软删）；active → active 保留（审批幂等重提）
 * - suspended → active（恢复）/ deleted；deleted 终态（硬删留运维）
 * 无状态记录（存量/seeded·旧无户籍行）按 active 对待（与中间件 deny-list 同口径）。
 */
const TRANSITIONS: Record<TenancyStatus, readonly TenancyStatus[]> = {
  [TENANCY_STATUS.PENDING]: [TENANCY_STATUS.ACTIVE, TENANCY_STATUS.DELETED],
  [TENANCY_STATUS.ACTIVE]: [
    TENANCY_STATUS.ACTIVE,
    TENANCY_STATUS.SUSPENDED,
    TENANCY_STATUS.DELETED,
  ],
  [TENANCY_STATUS.SUSPENDED]: [TENANCY_STATUS.ACTIVE, TENANCY_STATUS.DELETED],
  [TENANCY_STATUS.DELETED]: [],
};

/**
 * 迁移是否合法（from 缺省视同 active；终态 deleted 不接受任何迁移）。
 *
 * @param from - 迁移前状态（undefined 视同 active）
 * @param to - 目标状态
 * @returns 合法迁移边返回 `true`；否则 `false`
 * @public
 */
export function canTransition(from: TenancyStatus | undefined, to: TenancyStatus): boolean {
  return TRANSITIONS[from ?? TENANCY_STATUS.ACTIVE].includes(to);
}

import type { SubscriptionStatus } from '../../quota/organization-plans';

/**
 * Tenant subscription repository port (domain-owned · global-tenancy S7 · FR-7/FR-8/D5).
 *
 * 订阅是租户自有聚合，1:N 历史（每次改档新增一行·旧行留作升降级审计）。与 workspace port 同构：
 * **不暴露 organizationId 参数**——所属租户由 adapter 从可信 AsyncLocalStorage 上下文注入（`requireTenantId`
 * fail-closed·FR-5 单点），任何调用方都无法指向外部租户。配额裁决/限额读取属 `QuotaService`
 * （tenancy 层单点），本 port 只管订阅行的写与历史读，避免限额逻辑散点。
 */
export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');

/** 新建订阅行的写意图（原语·所属租户由 adapter 盖章）。 */
export interface SubscriptionDraft {
  plan: string;
  seatsLimit: number;
  storageQuota?: number | null;
  apiQuota?: number | null;
  periodEnd?: Date | null;
  /** FR-8 多通道映射（provider 侧引用）。 */
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}

/** 已持久化的订阅行（含所属租户以保透明）。 */
export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  plan: string;
  status: SubscriptionStatus;
  seatsLimit: number;
  storageQuota: number | null;
  apiQuota: number | null;
  periodStart: Date;
  periodEnd: Date | null;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionRepository {
  /** 在当前活跃租户下新建一条 active 订阅行（历史追加·不改旧行）。 */
  create(draft: SubscriptionDraft): Promise<SubscriptionRecord>;
  /** 当前活跃租户的订阅历史（periodStart 倒序）。 */
  history(): Promise<SubscriptionRecord[]>;
}

import type { SubscriptionStatus } from '../../quota/organization-plans';

/**
 * 租户订阅仓储端口的 DI 注入 token（领域自有 · global-tenancy S7 · FR-7/FR-8/D5）。
 *
 * @remarks
 * Tenant subscription repository port (domain-owned · global-tenancy S7 · FR-7/FR-8/D5).
 *
 * 订阅是租户自有聚合，1:N 历史（每次改档新增一行·旧行留作升降级审计）。与 workspace port 同构：
 * **不暴露 tenantId 参数**——所属租户由 adapter 从可信 AsyncLocalStorage 上下文注入（`requireActiveTenantId`
 * fail-closed·FR-5 单点），任何调用方都无法指向外部租户。配额裁决/限额读取属 `QuotaService`
 * （tenancy 层单点），本 port 只管订阅行的写与历史读，避免限额逻辑散点。
 *
 * global-tenant-organization-rehierarchy 切片 D（计费单位上移）：订阅锚从 `organizationId` 升 **`tenantId`**——
 * 一租多组织后按租户总量控制席位/配额才是正当语义（`organization_subscription`→`tenant_subscription`）。
 *
 * @public
 */
export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');

/**
 * 新建订阅行的写意图（原语·所属租户由 adapter 盖章）。
 *
 * @public
 */
export interface SubscriptionDraft {
  /** 套餐档位标识。 */
  plan: string;
  /** 席位数上限。 */
  seatsLimit: number;
  /** 存储配额（null=不限）。 */
  storageQuota?: number | null;
  /** API 调用配额（null=不限）。 */
  apiQuota?: number | null;
  /** 计费周期结束时间。 */
  periodEnd?: Date | null;
  /** FR-8 多通道映射（provider 侧引用）。 */
  provider?: string | null;
  /** 支付提供方侧客户 id。 */
  providerCustomerId?: string | null;
  /** 支付提供方侧订阅 id。 */
  providerSubscriptionId?: string | null;
}

/**
 * 已持久化的订阅行（含所属租户以保透明）。
 *
 * @public
 */
export interface SubscriptionRecord {
  /** 订阅行 id。 */
  id: string;
  /** 所属租户 id（隔离/计费主轴·rehierarchy 切片 D 自 organizationId 上移）。 */
  tenantId: string;
  /** 套餐档位标识。 */
  plan: string;
  /** 订阅状态。 */
  status: SubscriptionStatus;
  /** 席位数上限。 */
  seatsLimit: number;
  /** 存储配额（null=不限）。 */
  storageQuota: number | null;
  /** API 调用配额（null=不限）。 */
  apiQuota: number | null;
  /** 计费周期开始时间。 */
  periodStart: Date;
  /** 计费周期结束时间。 */
  periodEnd: Date | null;
  /** 支付提供方标识。 */
  provider: string | null;
  /** 支付提供方侧客户 id。 */
  providerCustomerId: string | null;
  /** 支付提供方侧订阅 id。 */
  providerSubscriptionId: string | null;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/**
 * 订阅仓储端口：当前活跃租户下的订阅行写入与历史读取（租户由 adapter 盖章）。
 *
 * @public
 */
export interface SubscriptionRepository {
  /**
   * 在当前活跃租户下新建一条 active 订阅行（历史追加·不改旧行）。
   *
   * @param draft - 写意图（plan/limits/provider refs）
   * @returns 新建的持久化订阅行
   */
  create(draft: SubscriptionDraft): Promise<SubscriptionRecord>;
  /**
   * 当前活跃租户的订阅历史（periodStart 倒序）。
   *
   * @returns 订阅行历史数组
   */
  history(): Promise<SubscriptionRecord[]>;
}

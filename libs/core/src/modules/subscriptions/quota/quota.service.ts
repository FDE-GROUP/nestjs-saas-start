import { Inject, Injectable } from '@nestjs/common';
import { FREE_PLAN } from './organization-plans';
import { type ActiveSubscriptionView, QUOTA_STORE, type QuotaStore } from './quota.store';
import { Quota } from './quota.vo';

/**
 * 一次座位配额裁决的结果（used/limit 供审计与回显·HTTP 翻译归消费点——P1）。
 *
 * @public
 */
export interface SeatQuotaVerdict {
  /** 判定是否通过。 */
  readonly ok: boolean;
  /** 已用量。 */
  readonly used: number;
  /** 每页数量上限。 */
  readonly limit: number;
}

/**
 * 读侧快照（GET current 的唯一装配点·FR-7/FR-8 视图）：生效档位 + 用量 + 映射。
 *
 * @public
 */
export interface SeatQuotaSnapshot {
  /** 是否存在有效订阅。 */
  readonly hasSubscription: boolean;
  /** 套餐档位标识。 */
  readonly plan: string;
  /** 席位数上限。 */
  readonly seatsLimit: number;
  /** 已用量。 */
  readonly used: number;
  /** 剩余额度。 */
  readonly remaining: number;
  /** 支付提供方侧客户 id。 */
  readonly providerCustomerId: string | null;
}

/**
 * 租户配额读写唯一卡点（S7 · FR-7）：生效限额取自最新 active 订阅行的 `seatsLimit` 快照。
 *
 * @remarks
 * 缺行回落 `FREE_PLAN`（带限额·裁②非 fail-open）。用量维度 = 成员数
 * （`COUNT(member where tenantId)`·实时算·不建 usage 表）。
 *
 * global-tenant-organization-rehierarchy 切片 D（计费单位上移）：入参轴从 `organizationId` 升 **`tenantId`**——
 * 一租多组织后席位/配额按租户总量聚合才是正当语义（生效订阅读 `tenant_subscription`·member 按 tenantId 计数）。
 *
 * 架构精度修宪 S2：**裁决不再抛 HTTP**（原 `assertSeats` 402 已删）——本服务属 kit 的
 * 领域/应用面，402 翻译归适配器角色消费点（`QuotaGuard` / auth `seats-quota.hook`），
 * 由其消费 `checkSeats` 判别结果后自行抛（P1 result-union 范式）。限额经 `Quota` VO
 * 摄入（存储/档位两源统一 fail-loud 防护，P2）。与 `UserStatusService`/`OrganizationStatusService`
 * 同层，禁散点。
 *
 * @public
 */
@Injectable()
export class QuotaService {
  constructor(@Inject(QUOTA_STORE) private readonly store: QuotaStore) {}

  /**
   * 当前生效订阅（最新 active 行 by periodStart desc），无 → null。
   *
   * @param tenantId - 目标租户 id
   * @returns 生效订阅视图；无 active 行返回 `null`
   */
  async currentSubscription(tenantId: string): Promise<ActiveSubscriptionView | null> {
    return this.store.currentActiveSubscription(tenantId);
  }

  /**
   * 生效座位限额（P2 · Quota VO）：有 active 订阅 → 摄入其 seatsLimit；无 → FREE_PLAN 档。
   *
   * @param tenantId - 目标租户 id
   * @returns 承载不变量的 `Quota` 限额
   */
  async effectiveSeatsLimit(tenantId: string): Promise<Quota> {
    const sub = await this.currentSubscription(tenantId);
    return sub ? Quota.of(sub.seatsLimit) : FREE_PLAN.seatsLimit;
  }

  /**
   * 当前用量 = 该租户成员数。
   *
   * @param tenantId - 目标租户 id
   * @returns 成员数量
   */
  async currentSeats(tenantId: string): Promise<number> {
    return this.store.countMembers(tenantId);
  }

  /**
   * 纯裁决（不抛·P1 result-union）：used + adding 是否仍在限额内。
   *
   * @param tenantId - 目标租户 id
   * @param adding - 本次预计新增成员数（默认 1）
   * @returns 座位配额裁决结果（ok/used/limit）
   */
  async checkSeats(tenantId: string, adding = 1): Promise<SeatQuotaVerdict> {
    const [limit, used] = await Promise.all([
      this.effectiveSeatsLimit(tenantId),
      this.currentSeats(tenantId),
    ]);
    return { ok: used + adding <= limit.value, used, limit: limit.value };
  }

  /**
   * 读侧单点快照（S7 · FR-7/FR-8）：当前生效订阅 + 座位用量 + FR-8 customer 映射。
   *
   * @remarks
   * 复用 `currentSubscription`/`currentSeats`·限额逻辑不另起炉灶（禁散点）。
   *
   * @param tenantId - 目标租户 id
   * @returns 生效档位/用量/映射的读侧快照
   */
  async snapshot(tenantId: string): Promise<SeatQuotaSnapshot> {
    const sub = await this.currentSubscription(tenantId);
    const limit = sub ? Quota.of(sub.seatsLimit) : FREE_PLAN.seatsLimit;
    const used = await this.currentSeats(tenantId);
    return {
      hasSubscription: sub !== null,
      plan: sub?.plan ?? FREE_PLAN.plan,
      seatsLimit: limit.value,
      used,
      remaining: Math.max(0, limit.value - used),
      providerCustomerId: sub?.providerCustomerId ?? null,
    };
  }
}

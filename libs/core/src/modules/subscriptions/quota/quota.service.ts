import { Inject, Injectable } from '@nestjs/common';
import { type ActiveSubscriptionView, QUOTA_STORE, type QuotaStore } from './quota.store';
import { FREE_PLAN } from './tenant-plans';
import { Quota } from './quota.vo';

/** 一次座位配额裁决的结果（used/limit 供审计与回显·HTTP 翻译归消费点——P1）。 */
export interface SeatQuotaVerdict {
  readonly ok: boolean;
  readonly used: number;
  readonly limit: number;
}

/** 读侧快照（GET current 的唯一装配点·FR-7/FR-8 视图）：生效档位 + 用量 + 映射。 */
export interface SeatQuotaSnapshot {
  readonly hasSubscription: boolean;
  readonly plan: string;
  readonly seatsLimit: number;
  readonly used: number;
  readonly remaining: number;
  readonly providerCustomerId: string | null;
}

/**
 * 租户配额读写唯一卡点（S7 · FR-7）：生效限额取自最新 active 订阅行的 `seatsLimit`
 * 快照，缺行回落 `FREE_PLAN`（带限额·裁②非 fail-open）。用量维度 = 成员数
 * （`COUNT(member where organizationId)`·实时算·不建 usage 表）。
 *
 * 架构精度修宪 S2：**裁决不再抛 HTTP**（原 `assertSeats` 402 已删）——本服务属 kit 的
 * 领域/应用面，402 翻译归适配器角色消费点（`QuotaGuard` / auth `seats-quota.hook`），
 * 由其消费 `checkSeats` 判别结果后自行抛（P1 result-union 范式）。限额经 `Quota` VO
 * 摄入（存储/档位两源统一 fail-loud 防护，P2）。与 `UserStatusService`/`TenantStatusService`
 * 同层，禁散点。
 */
@Injectable()
export class QuotaService {
  constructor(@Inject(QUOTA_STORE) private readonly store: QuotaStore) {}

  /** 当前生效订阅（最新 active 行 by periodStart desc），无 → null。 */
  async currentSubscription(tenantId: string): Promise<ActiveSubscriptionView | null> {
    return this.store.currentActiveSubscription(tenantId);
  }

  /** 生效座位限额（P2 · Quota VO）：有 active 订阅 → 摄入其 seatsLimit；无 → FREE_PLAN 档。 */
  async effectiveSeatsLimit(tenantId: string): Promise<Quota> {
    const sub = await this.currentSubscription(tenantId);
    return sub ? Quota.of(sub.seatsLimit) : FREE_PLAN.seatsLimit;
  }

  /** 当前用量 = 该租户成员数。 */
  async currentSeats(tenantId: string): Promise<number> {
    return this.store.countMembers(tenantId);
  }

  /** 纯裁决（不抛·P1 result-union）：used + adding 是否仍在限额内。 */
  async checkSeats(tenantId: string, adding = 1): Promise<SeatQuotaVerdict> {
    const [limit, used] = await Promise.all([
      this.effectiveSeatsLimit(tenantId),
      this.currentSeats(tenantId),
    ]);
    return { ok: used + adding <= limit.value, used, limit: limit.value };
  }

  /**
   * 读侧单点快照（S7 · FR-7/FR-8）：当前生效订阅（缺行回落免费档）+ 座位用量 +
   * FR-8 customer 映射。复用 `currentSubscription`/`currentSeats`·限额逻辑不另起炉灶（禁散点）。
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

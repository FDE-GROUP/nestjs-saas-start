/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
/**
 * Subscription read-model projections (global-tenancy S7 · FR-7/FR-8 · CQRS read side).
 *
 * 当前生效档位 + 座位用量 + FR-8 映射的视图统一由 tenancy 层 `QuotaService.snapshot` 装配
 * （限额逻辑单点·禁散点），此处只做类型转发供 application/controller 消费；历史列表复用
 * domain port 的记录形状。
 */

export type { SubscriptionRecord as SubscriptionHistoryRow } from '../../domain/repositories/subscription.repository';
export type { SeatQuotaSnapshot as TenantSubscriptionView } from '../../quota/quota.service';

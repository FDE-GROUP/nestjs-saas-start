/**
 * Subscription read-model projections (global-tenancy S7 · FR-7/FR-8 · CQRS read side).
 *
 * @remarks
 * 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。
 * 当前生效档位 + 座位用量 + FR-8 映射的视图统一由 tenancy 层 `QuotaService.snapshot` 装配
 * （限额逻辑单点·禁散点），此处只做类型转发供 application/controller 消费；历史列表复用
 * domain port 的记录形状。
 */

/**
 * 订阅历史行形状（转发 domain 仓储记录类型·供读侧历史列表消费）。
 *
 * @public
 */
export type { SubscriptionRecord as SubscriptionHistoryRow } from '../../domain/repositories/subscription.repository';

/**
 * 当前订阅视图（转发 `QuotaService` 的座位配额快照·生效档位 + 用量 + FR-8 映射）。
 *
 * @public
 */
export type { SeatQuotaSnapshot as OrganizationSubscriptionView } from '../../quota/quota.service';

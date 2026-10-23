import { BaseCommand } from '../../../../shared-kernel/cqrs/types';
import type { OrganizationSubscriptionView } from '../read-models/subscription.read-model';

/**
 * 租户开通/改档订阅（S7 · FR-7/FR-8/D5）：在当前活跃租户追加一条 active 订阅行，并实际调用
 * `PaymentService.createCustomer` 建立 **tenant ↔ customer** 映射（FR-8·多通道 provider 抽象，
 * Stripe 先行、境内 D9 暂缓）。所属租户不在命令里——由仓储 adapter 从 ALS 上下文盖章（FR-5 单点）。
 * `seatsLimit` 缺省取档位目录（`resolvePlanDef`）。返回 `QuotaService.snapshot` 的生效档位视图。
 */
export class CreateSubscriptionCommand extends BaseCommand<OrganizationSubscriptionView> {
  constructor(
    readonly plan: string,
    readonly customerEmail: string,
    readonly seatsLimit?: number,
    readonly storageQuota?: number,
    readonly apiQuota?: number,
  ) {
    super();
  }
}

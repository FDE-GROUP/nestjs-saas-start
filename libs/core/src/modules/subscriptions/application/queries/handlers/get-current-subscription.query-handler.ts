import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TenantIsolationService } from '../../../../../tenant-isolation/tenant-isolation.service';
import { QuotaService } from '../../../quota/quota.service';
import type { OrganizationSubscriptionView } from '../../read-models/subscription.read-model';
import { GetSubscriptionQuery } from '../get-current-subscription.query';

/**
 * 当前订阅视图读侧处理器（FR-7/FR-8 读侧）。
 *
 * @remarks
 * 限额/用量装配单点走 `QuotaService.snapshot`（禁散点），
 * 租户从 ALS 上下文取（`requireActiveTenantId` fail-closed·rehierarchy 切片 D 计费轴上移）。
 *
 * @public
 */
@QueryHandler(GetSubscriptionQuery)
export class GetSubscriptionQueryHandler implements IQueryHandler<GetSubscriptionQuery> {
  constructor(
    @Inject(QuotaService) private readonly quota: QuotaService,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
  ) {}

  /**
   * 以 ALS 活跃租户装配 `QuotaService.snapshot` 读侧视图。
   *
   * @param _query - 待执行的查询（无字段·租户取自 ALS）
   * @returns 生效档位/用量/映射的读侧快照
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(_query: GetSubscriptionQuery): Promise<OrganizationSubscriptionView> {
    return this.quota.snapshot(this.tenant.requireActiveTenantId());
  }
}

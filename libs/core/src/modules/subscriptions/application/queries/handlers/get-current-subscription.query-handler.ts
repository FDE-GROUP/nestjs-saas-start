import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TenantContextService } from '../../../../../tenancy/tenant-context.service';
import { QuotaService } from '../../../quota/quota.service';
import type { OrganizationSubscriptionView } from '../../read-models/subscription.read-model';
import { GetSubscriptionQuery } from '../get-current-subscription.query';

/**
 * 当前订阅视图（FR-7/FR-8 读侧）。限额/用量装配单点走 `QuotaService.snapshot`（禁散点），
 * 租户从 ALS 上下文取（`requireTenantId` fail-closed）。
 */
@QueryHandler(GetSubscriptionQuery)
export class GetSubscriptionQueryHandler implements IQueryHandler<GetSubscriptionQuery> {
  constructor(
    @Inject(QuotaService) private readonly quota: QuotaService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(_query: GetSubscriptionQuery): Promise<OrganizationSubscriptionView> {
    return this.quota.snapshot(this.tenant.requireTenantId());
  }
}

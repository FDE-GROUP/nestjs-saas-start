import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { PlatformTenantPage } from '../../read-models/platform-tenant.read-model';
import { ListPlatformTenantsQuery } from '../list-platform-tenants.query';

/**
 * 跨租租户列表查询处理器（FR-6·平台级读侧·治理台改锚 tenant）。
 *
 * @remarks
 * 刻意租户无关：治理仓储不施加任何租户过滤（平台级天然见全量·FR-11①），
 * 访问裁决由 controller 侧 `PlatformOperatorGuard` 前置把守。
 * @public
 */
@QueryHandler(ListPlatformTenantsQuery)
export class ListPlatformTenantsQueryHandler implements IQueryHandler<ListPlatformTenantsQuery> {
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  /**
   * 委派治理端口分页取租户列表。
   * @param query - 携带 limit/offset/search 的查询。
   * @returns 平台级租户分页页。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListPlatformTenantsQuery): Promise<PlatformTenantPage> {
    return this.governance.listTenants({
      limit: query.limit,
      offset: query.offset,
      search: query.search,
    });
  }
}

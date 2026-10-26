import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { PlatformTenantDetail } from '../../read-models/platform-tenant.read-model';
import { GetPlatformTenantQuery } from '../get-platform-tenant.query';

/**
 * 租户详情查询处理器（FR-6·平台级读侧·治理台改锚 tenant）。
 *
 * @remarks
 * Tenant detail（tenant 基本盘 + 名下组织名册·平台级读侧）。
 * @public
 */
@QueryHandler(GetPlatformTenantQuery)
export class GetPlatformTenantQueryHandler implements IQueryHandler<GetPlatformTenantQuery> {
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  /**
   * 委派治理端口取租户详情。
   * @param query - 携带租户 id 的查询。
   * @returns 租户详情；查无为 `null`。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetPlatformTenantQuery): Promise<PlatformTenantDetail | null> {
    return this.governance.findTenantDetail(query.tenantId);
  }
}

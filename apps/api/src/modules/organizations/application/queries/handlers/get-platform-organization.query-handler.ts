import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { PlatformOrganizationRow } from '../../read-models/platform-organization.read-model';
import { GetPlatformOrganizationQuery } from '../get-platform-organization.query';

/**
 * 租户详情查询处理器（FR-6·平台级读侧）。
 *
 * @remarks
 * Organization detail (FR-6 · platform-level read side).
 * @public
 */
@QueryHandler(GetPlatformOrganizationQuery)
export class GetPlatformOrganizationQueryHandler
  implements IQueryHandler<GetPlatformOrganizationQuery>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  /**
   * 委派治理端口取租户行。
   * @param query - 携带租户 id 的查询。
   * @returns 租户行；查无为 `null`。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetPlatformOrganizationQuery): Promise<PlatformOrganizationRow | null> {
    return this.governance.findById(query.organizationId);
  }
}

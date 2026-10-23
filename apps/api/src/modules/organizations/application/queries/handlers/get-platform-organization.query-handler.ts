import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { PlatformOrganizationRow } from '../../read-models/platform-organization.read-model';
import { GetPlatformOrganizationQuery } from '../get-platform-organization.query';

/** Organization detail (FR-6 · platform-level read side). */
@QueryHandler(GetPlatformOrganizationQuery)
export class GetPlatformOrganizationQueryHandler
  implements IQueryHandler<GetPlatformOrganizationQuery>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetPlatformOrganizationQuery): Promise<PlatformOrganizationRow | null> {
    return this.governance.findById(query.organizationId);
  }
}

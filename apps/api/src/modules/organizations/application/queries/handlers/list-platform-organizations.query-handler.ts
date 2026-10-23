import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { PlatformOrganizationPage } from '../../read-models/platform-organization.read-model';
import { ListPlatformOrganizationsQuery } from '../list-platform-organizations.query';

/**
 * Cross-tenant list (FR-6). Deliberately tenant-agnostic: the governance repository
 * applies NO tenant filter (platform-level sees everything, FR-11①); access is gated
 * upstream by `PlatformOperatorGuard` on the controller route.
 */
@QueryHandler(ListPlatformOrganizationsQuery)
export class ListPlatformOrganizationsQueryHandler
  implements IQueryHandler<ListPlatformOrganizationsQuery>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListPlatformOrganizationsQuery): Promise<PlatformOrganizationPage> {
    return this.governance.list({
      limit: query.limit,
      offset: query.offset,
      search: query.search,
    });
  }
}

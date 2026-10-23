import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { OrganizationDiagnostics } from '../../read-models/platform-organization.read-model';
import { GetOrganizationDiagnosticsQuery } from '../get-organization-diagnostics.query';

/** Per-tenant diagnostics (FR-6 · platform-level read side). */
@QueryHandler(GetOrganizationDiagnosticsQuery)
export class GetOrganizationDiagnosticsQueryHandler
  implements IQueryHandler<GetOrganizationDiagnosticsQuery>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetOrganizationDiagnosticsQuery): Promise<OrganizationDiagnostics | null> {
    return this.governance.diagnostics(query.organizationId);
  }
}

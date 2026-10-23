import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { OrganizationDataExport } from '../../read-models/organization-data-export.read-model';
import { ExportOrganizationDataQuery } from '../export-organization-data.query';

/** Per-tenant data export (NFR-6 · platform-level read side · S5 soft-delete 取证闭环）。 */
@QueryHandler(ExportOrganizationDataQuery)
export class ExportOrganizationDataQueryHandler
  implements IQueryHandler<ExportOrganizationDataQuery>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ExportOrganizationDataQuery): Promise<OrganizationDataExport | null> {
    return this.governance.exportOrganizationData(query.organizationId);
  }
}

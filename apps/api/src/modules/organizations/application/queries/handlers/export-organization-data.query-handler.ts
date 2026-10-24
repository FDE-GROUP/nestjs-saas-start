import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { OrganizationDataExport } from '../../read-models/organization-data-export.read-model';
import { ExportOrganizationDataQuery } from '../export-organization-data.query';

/**
 * 按租户导出数据查询处理器（NFR-6·平台级读侧·S5 软删取证闭环）。
 *
 * @remarks
 * Per-tenant data export (NFR-6 · platform-level read side · S5 soft-delete 取证闭环）。
 * @public
 */
@QueryHandler(ExportOrganizationDataQuery)
export class ExportOrganizationDataQueryHandler
  implements IQueryHandler<ExportOrganizationDataQuery>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  /**
   * 委派治理端口取六段聚合导出体。
   * @param query - 携带租户 id 的查询。
   * @returns 导出体；查无为 `null`。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ExportOrganizationDataQuery): Promise<OrganizationDataExport | null> {
    return this.governance.exportOrganizationData(query.organizationId);
  }
}

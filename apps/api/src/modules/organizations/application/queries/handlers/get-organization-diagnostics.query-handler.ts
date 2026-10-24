import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { OrganizationDiagnostics } from '../../read-models/platform-organization.read-model';
import { GetOrganizationDiagnosticsQuery } from '../get-organization-diagnostics.query';

/**
 * 按租户诊断查询处理器（FR-6·平台级读侧）。
 *
 * @remarks
 * Per-tenant diagnostics (FR-6 · platform-level read side).
 * @public
 */
@QueryHandler(GetOrganizationDiagnosticsQuery)
export class GetOrganizationDiagnosticsQueryHandler
  implements IQueryHandler<GetOrganizationDiagnosticsQuery>
{
  constructor(
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
  ) {}

  /**
   * 委派治理端口取诊断快照。
   * @param query - 携带租户 id 的查询。
   * @returns 诊断快照；查无为 `null`。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetOrganizationDiagnosticsQuery): Promise<OrganizationDiagnostics | null> {
    return this.governance.diagnostics(query.organizationId);
  }
}

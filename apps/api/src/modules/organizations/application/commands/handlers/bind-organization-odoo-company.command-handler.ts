import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../../../domain/repositories/organization-governance.repository';
import type { OrganizationOdooBindingReadModel } from '../../read-models/organization-odoo-binding.read-model';
import { BindOrganizationOdooCompanyCommand } from '../bind-organization-odoo-company.command';

/**
 * bind-existing 回填 handler（module-org-odoo-company-mapping 切片 A·平台级）。
 *
 * @remarks
 * 门槛链（fail-closed）：租户须存在（null → 控制层 404）∧ 治理态 `active`（非 active → 409，
 * pending/suspended/deleted 不允许建立映射，防「未获批即有 Odoo 公司」绕开审批单源）；
 * 占用预检查 + `odooCompanyId` 库级 unique 双防线（一公司只归一组织）在端口内裁决
 * （`conflict` → 409 + 失败尝试观测审计·判别子带 error 不落耐久账本）。
 * 成功经 `PlatformAuditService` 产出 `bind_odoo` 结构化审计（FR-6 单点·禁散点手搓）。
 * 幂等口径：同租户重复绑定同公司 = 覆盖快照成功；换绑他司受 unique 冲突天然拦截。
 * @public
 */
@CommandHandler(BindOrganizationOdooCompanyCommand)
export class BindOrganizationOdooCompanyCommandHandler
  implements ICommandHandler<BindOrganizationOdooCompanyCommand>
{
  constructor(
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入（Symbol 端口）。
    @Inject(ORGANIZATION_GOVERNANCE_REPOSITORY)
    private readonly governance: OrganizationGovernanceRepository,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  /**
   * 执行回填绑定。
   * @param command - 携带租户 id、公司 id/名称快照与操作者的命令。
   * @returns 绑定回执读模型；租户查无为 `null`。
   */
  async execute(
    command: BindOrganizationOdooCompanyCommand,
  ): Promise<OrganizationOdooBindingReadModel | null> {
    const admission = await this.governance.findOrganizationAdmission(command.organizationId);
    if (admission === null) return null;
    if (admission !== TENANCY_STATUS.ACTIVE) {
      throw new ConflictException(
        `Only active organizations can bind an Odoo company (status: ${admission})`,
        { errorCode: ERROR_CODES.ORG_ILLEGAL_TRANSITION },
      );
    }

    const outcome = await this.governance.bindOdooCompany(command.organizationId, {
      odooCompanyId: command.odooCompanyId,
      odooCompanyName: command.odooCompanyName,
    });
    if (outcome.kind === 'not-found') return null;
    if (outcome.kind === 'conflict') {
      // 失败尝试：带 error 判别子 → 只进观测流、不入耐久账本（无状态变更可留痕）。
      await this.audit.logOrganizationGovernance(
        'bind_odoo',
        command.organizationId,
        command.operatorId,
        {
          error: 'odoo_company_conflict',
        },
      );
      throw new ConflictException(
        `Odoo company ${command.odooCompanyId} is already bound to another organization`,
        { errorCode: ERROR_CODES.ORG_ODOO_BINDING_CONFLICT },
      );
    }
    const { binding } = outcome;
    await this.audit.logOrganizationGovernance(
      'bind_odoo',
      command.organizationId,
      command.operatorId,
      {
        reason: `bind-existing: odooCompanyId=${binding.odooCompanyId}`,
      },
    );
    return {
      organizationId: binding.organizationId,
      odooCompanyId: binding.odooCompanyId,
      odooBindingStatus: binding.odooBindingStatus,
      odooCompanyName: binding.odooCompanyName,
      odooBoundAt: binding.odooBoundAt,
    };
  }
}

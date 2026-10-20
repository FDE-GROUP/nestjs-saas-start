import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';
import { SuspendTenantCommand } from '../suspend-tenant.command';
import { governedTenantTransition } from './governed-tenant-transition';

/**
 * 暂停租户（FR-6/FR-10·平台级）：`active → suspended`，经 `TenantStatusService.transition`
 * 严格裁决（§9.4 迁移表·非法 → 409·不存在 → null 转 404），`tenant` 户籍表单点写回；
 * 中间件 deny-list 使该租户业务面即时失能。成败均落结构化审计（FR-6）。
 * 架构精度修宪 S4：三分支样板收敛至 `governedTenantTransition` 共用用例（薄壳）。
 */
@CommandHandler(SuspendTenantCommand)
export class SuspendTenantCommandHandler implements ICommandHandler<SuspendTenantCommand> {
  constructor(
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(command: SuspendTenantCommand): Promise<TenantApplicationReadModel | null> {
    const result = await governedTenantTransition(
      { status: this.status, audit: this.audit },
      {
        action: 'suspend',
        organizationId: command.organizationId,
        operatorId: command.operatorId,
        target: TENANT_STATUS.SUSPENDED,
      },
    );
    return result;
  }
}

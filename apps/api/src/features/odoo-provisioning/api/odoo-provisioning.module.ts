import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { OdooJsonClient } from '../../odoo-rpc-api/infrastructure/odoo-json.client';
import { OdooProvisioningSaga } from '../application/odoo-provisioning.saga';
import { ODOO_COMPANY_GATEWAY } from '../infrastructure/odoo-company-gateway';
import { OdooJsonCompanyGateway } from '../infrastructure/odoo-json-company.gateway';

/**
 * 租户开通 saga 装配根（module-org-odoo-company-mapping 切片 C·写侧通道·与只读 RPC feature 分开）。
 *
 * 本叠件住本公共仓 `apps/api/src/features/odoo-provisioning/`（开源边界重划 2026-10-28 后常驻追踪·非私有同步副本），
 * 由 `feature-loader.ts` 运行期探测装配（严格叠加·缺席态不绑架构建）。层形遵 architecture §features/ 专属区条：
 * `{application, infrastructure, api}`、无 `domain/`。绑定读写端口经 `@Global` OrganizationsModule 提供，
 * 本模块无需 import；`OdooJsonClient` 就近自带一份（无状态·避免 feature 间 DI 交叉耦合），建司深水区行为
 * 见 {@link OdooJsonCompanyGateway} 类头诚实边界（联调窗补实）。
 */
@Module({
  imports: [CqrsModule],
  providers: [
    OdooProvisioningSaga,
    OdooJsonClient,
    { provide: ODOO_COMPANY_GATEWAY, useClass: OdooJsonCompanyGateway },
  ],
})
export class OdooProvisioningModule {}

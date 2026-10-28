import { OrganizationStatusTransitionedEvent } from '@core/saas-kit/modules/organizations/lifecycle/events/organization-status-transitioned.event';
import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import {
  expectedOdooCompanyName,
  ORGANIZATION_ODOO_BINDING_STATUS,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import {
  ORGANIZATION_ODOO_BINDING_READER,
  type OrganizationOdooBindingReader,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import {
  ORGANIZATION_ODOO_BINDING_WRITER,
  type OrganizationOdooBindingWriter,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-writer';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import {
  ODOO_COMPANY_GATEWAY,
  type OdooCompanyGateway,
} from '../infrastructure/odoo-company-gateway';

/**
 * 确定性公司名（仅由租户 id 派生·可复现）——命名口径单源住 `@core`（`expectedOdooCompanyName`·saga 与
 * doctor 同址），本处再导出保留 saga 侧调用点语义。重投/崩溃恢复据此回找，命中即复用不重建。
 * @public
 */
export const expectedCompanyName = expectedOdooCompanyName;

/**
 * 租户开通 saga（module-org-odoo-company-mapping 切片 C·features/odoo-provisioning 专属区·写侧通道）。
 *
 * @remarks
 * 订阅 `OrganizationStatusTransitionedEvent`（`TenantStatusService.transition` 成功分支产出·
 * outbox/inproc 两投递通道经 `EVENT_TYPE_REGISTRY` 以**同一事件类**重建必达本 handler·类同一性由 registry
 * 契约测双向锁背书），**仅对首次开通**（`from=pending_approval ∧ to=active`）触发——resume（suspended→active）、
 * 幂等重提（active→active）一律 no-op。与 `OrganizationStatusSubscriptionLinkHandler` 共订阅同一事件、
 * 各司其职（跨上下文只经领域事件·本 feature 零特判）。
 *
 * 编排（每步经 `@core` published port 耐久·可中断恢复）：
 *  1. `reader.read` 取绑定行；租户消失 → 退出；已 `ready` → 幂等退出（防重投重复建司）；
 *  2. `writer.beginProvisioning` **先落意图**（`provisioning`）——方向永远对，其后崩溃可由命名回找恢复；
 *  3. `gateway.findCompanyIdByName ?? createCompany`（回找优先）→ 本地化基线 → 管理员预配；
 *  4. 全绿 → `writer.markReady`（回写 companyId/name·清失败原因）；
 *  5. 任一步抛 → `writer.markFailed`（携原因）——不吞异常、不把半成品误标 ready（fail-closed）。
 *
 * at-least-once 幂等：本 handler 无计数副作用，重投由「已 ready 早退 + 命名回找」双重收敛；Odoo 深水区
 * （本地化/预配）在骨架窗为带日志占位（见 {@link OdooCompanyGateway} 适配类头·联调窗补实）。
 */
@Injectable()
@EventsHandler(OrganizationStatusTransitionedEvent)
export class OdooProvisioningSaga implements IEventHandler<OrganizationStatusTransitionedEvent> {
  private readonly logger = new Logger(OdooProvisioningSaga.name);

  constructor(
    // S9 教训：Symbol 端口显式 @Inject + 值导入，防 swc design:paramtypes 退化。
    @Inject(ORGANIZATION_ODOO_BINDING_READER)
    private readonly bindings: OrganizationOdooBindingReader,
    @Inject(ORGANIZATION_ODOO_BINDING_WRITER)
    private readonly writer: OrganizationOdooBindingWriter,
    @Inject(ODOO_COMPANY_GATEWAY) private readonly gateway: OdooCompanyGateway,
  ) {}

  /**
   * 处理事件：仅首次开通触发建司编排，其余迁移 no-op。
   * @param event - 租户状态迁移事件。
   */
  async handle(event: OrganizationStatusTransitionedEvent): Promise<void> {
    const { from, to } = event.payload;
    if (from !== TENANT_STATUS.PENDING || to !== TENANT_STATUS.ACTIVE) {
      return; // 非首次开通（resume/幂等重提/delete 等）零动作
    }

    const organizationId = event.aggregateId;
    const binding = await this.bindings.read(organizationId);
    if (!binding) return; // 租户已消失·无从开通
    if (binding.odooBindingStatus === ORGANIZATION_ODOO_BINDING_STATUS.READY) {
      // 幂等：已就绪（重投/滞后事件）·绝不重复建司。
      this.logger.debug(`已就绪，跳过开通：tenant=${organizationId} eventId=${event.eventId}`);
      return;
    }

    const name = expectedCompanyName(organizationId);
    await this.writer.beginProvisioning(organizationId); // 先落意图·方向永远对
    try {
      // 命名回找优先：命中即复用（重投/崩溃恢复不重建），未命中才建。
      let companyId = await this.gateway.findCompanyIdByName(name);
      if (companyId === null) {
        companyId = await this.gateway.createCompany(name);
      }
      await this.gateway.applyLocalizationBaseline(companyId);
      await this.gateway.provisionAdministrator(companyId);
      await this.writer.markReady(organizationId, {
        odooCompanyId: companyId,
        odooCompanyName: name,
      });
      this.logger.log(
        `开通就绪：tenant=${organizationId} company=${companyId} eventId=${event.eventId}`,
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.writer.markFailed(organizationId, reason);
      this.logger.warn(`开通失败（置 failed）：tenant=${organizationId} reason=${reason}`);
    }
  }
}

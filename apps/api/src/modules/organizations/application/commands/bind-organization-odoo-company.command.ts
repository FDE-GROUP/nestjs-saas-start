import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { OrganizationOdooBindingReadModel } from '../read-models/organization-odoo-binding.read-model';

/**
 * 平台级动作（module-org-odoo-company-mapping 切片 A）：bind-existing 回填——把 Odoo 侧
 * 现存公司绑定给租户，绑定态直落 `ready`（回填系人工确认动作，无 provisioning 中间态）。
 *
 * @remarks
 * 返回绑定回执；租户不存在 → null（控制层转 404）；公司已被其它租户占用 / 租户非 active → 409。
 * `operatorId` = 会话主体（PlatformOperatorGuard 已裁决平台权），供结构化审计，非请求体可伪造字段。
 * @public
 */
export class BindOrganizationOdooCompanyCommand extends BaseCommand<OrganizationOdooBindingReadModel | null> {
  constructor(
    readonly organizationId: string,
    readonly odooCompanyId: number,
    readonly odooCompanyName: string,
    readonly operatorId: string,
  ) {
    super();
  }
}

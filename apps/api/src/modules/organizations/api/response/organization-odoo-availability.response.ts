import type { OrganizationOdooBindingStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import { ApiProperty } from '@nestjs/swagger';
import type { OrganizationOdooAvailabilityView } from '@saas/contracts/index';
import { ORGANIZATION_ODOO_BINDING_STATUS_ENUM } from './organization-odoo-binding.response';

/**
 * 当前活跃租户 Odoo 可用性响应契约（module-org-odoo-company-mapping 切片 D · apps 面板数据源）——
 * 真相源 = `@saas/contracts` `OrganizationOdooAvailabilityView`（self 读端点专用）。
 * @public
 */
export class OrganizationOdooAvailabilityResponse {
  /** Odoo 能力当前对该租户是否可用（`canUseOdoo` 单源裁决）。 */
  @ApiProperty({ description: 'Odoo 能力当前对该租户是否可用（canUseOdoo 单源裁决）。' })
  available!: boolean;

  /** 绑定生命周期态（null=未绑定/无活跃租户）。 */
  @ApiProperty({
    enum: ORGANIZATION_ODOO_BINDING_STATUS_ENUM,
    nullable: true,
    description: '绑定生命周期态（null=未绑定/无活跃租户）。',
  })
  odooBindingStatus!: OrganizationOdooBindingStatus | null;

  /** 绑定的 Odoo 公司 id（无绑定即 null）。 */
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '绑定的 Odoo 公司 id（res.company 主键·无绑定即 null）。',
  })
  odooCompanyId!: number | null;
}

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ response 类，任一侧漂移则 tsc 红。——
const _tav1: OrganizationOdooAvailabilityResponse = {} as OrganizationOdooAvailabilityView;
const _tav2: OrganizationOdooAvailabilityView = {} as OrganizationOdooAvailabilityResponse;
void _tav1;
void _tav2;

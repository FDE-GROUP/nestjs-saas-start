import type { OrganizationOdooBindingStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import { ApiProperty } from '@nestjs/swagger';
import type { OrganizationOdooBindingView } from '@saas/contracts/index';
import type { OrganizationOdooBindingReadModel } from '../../application/read-models/organization-odoo-binding.read-model';

/** 绑定生命周期状态取值（SSOT = `@core` ORGANIZATION_ODOO_BINDING_STATUS·枚举形为文档投影）。 @public */
export const ORGANIZATION_ODOO_BINDING_STATUS_ENUM = [
  'pending',
  'provisioning',
  'ready',
  'failed',
] as const;

/**
 * 租户↔Odoo 公司绑定回执响应契约（module-org-odoo-company-mapping 切片 A）——
 * 真相源 = `OrganizationOdooBindingReadModel`（bind-existing 端点专用）。
 * @public
 */
export class OrganizationOdooBindingResponse {
  /** 所属租户 id。 */
  @ApiProperty({ description: 'organization 主键。' })
  organizationId!: string;

  /** 绑定的 Odoo 公司 id（跨库弱引用）。 */
  @ApiProperty({ description: '绑定的 Odoo 公司 id（res.company 主键·跨库弱引用）。' })
  odooCompanyId!: number;

  /** 绑定生命周期态。 */
  @ApiProperty({ enum: ORGANIZATION_ODOO_BINDING_STATUS_ENUM, description: '绑定生命周期态。' })
  odooBindingStatus!: OrganizationOdooBindingStatus;

  /** 公司名快照。 */
  @ApiProperty({ type: String, nullable: true, description: '公司名快照（denormalize）。' })
  odooCompanyName!: string | null;

  /** 绑定确立时间。 */
  @ApiProperty({ type: Date, nullable: true, description: '绑定确立时间。' })
  odooBoundAt!: Date | null;
}

// —— 编译期双向对拍：response 类与真相源结构恒等，任一侧漂移则 tsc 红。——
const _tfwd: OrganizationOdooBindingResponse = {} as OrganizationOdooBindingReadModel;
const _tbwd: OrganizationOdooBindingReadModel = {} as OrganizationOdooBindingResponse;
void _tfwd;
void _tbwd;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源。——
const _tav1: OrganizationOdooBindingView = {} as OrganizationOdooBindingReadModel;
const _tav2: OrganizationOdooBindingReadModel = {} as OrganizationOdooBindingView;
void _tav1;
void _tav2;

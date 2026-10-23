import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ApiProperty } from '@nestjs/swagger';
import type { TenantApplicationView } from '@saas/contracts/index';
import type { TenantApplicationReadModel } from '../../application/read-models/tenant-application.read-model';

/** 生命周期状态机取值（SSOT = @core ORGANIZATION_STATUS·枚举形为文档投影·与字段 union 同文法）。 */
export const ORGANIZATION_STATUS_ENUM = [
  'pending_approval',
  'active',
  'suspended',
  'deleted',
] as const;

/**
 * 租户申请/生命周期响应契约（F1 甲①）——真相源 = `TenantApplicationReadModel`。
 * 复用于 tenants apply/approve + platform suspend/resume/delete（同一读模型）。
 */
export class TenantApplicationResponse {
  @ApiProperty({ description: 'organization 主键（= 租户 id）。' })
  organizationId!: string;

  @ApiProperty({ enum: ORGANIZATION_STATUS_ENUM, description: '生命周期状态。' })
  status!: OrganizationStatus;
}

// —— 编译期双向对拍：response 类与真相源结构恒等，任一侧漂移则 tsc 红。——
const _tfwd: TenantApplicationResponse = {} as TenantApplicationReadModel;
const _tbwd: TenantApplicationReadModel = {} as TenantApplicationResponse;
void _tfwd;
void _tbwd;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源。——
const _tav1: TenantApplicationView = {} as TenantApplicationReadModel;
const _tav2: TenantApplicationReadModel = {} as TenantApplicationView;
void _tav1;
void _tav2;

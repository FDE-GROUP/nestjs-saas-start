import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ApiProperty } from '@nestjs/swagger';
import type { OrganizationApplicationView } from '@saas/contracts/index';
import type { OrganizationApplicationReadModel } from '../../application/read-models/organization-application.read-model';

/** 生命周期状态机取值（SSOT = @core ORGANIZATION_STATUS·枚举形为文档投影·与字段 union 同文法）。 */
export const ORGANIZATION_STATUS_ENUM = [
  'pending_approval',
  'active',
  'suspended',
  'deleted',
] as const;

/**
 * 租户申请/生命周期响应契约（F1 甲①）——真相源 = `OrganizationApplicationReadModel`。
 * 复用于 tenants apply/approve + platform suspend/resume/delete（同一读模型）。
 */
export class OrganizationApplicationResponse {
  @ApiProperty({ description: 'organization 主键（= 租户 id）。' })
  organizationId!: string;

  @ApiProperty({ enum: ORGANIZATION_STATUS_ENUM, description: '生命周期状态。' })
  status!: OrganizationStatus;
}

// —— 编译期双向对拍：response 类与真相源结构恒等，任一侧漂移则 tsc 红。——
const _tfwd: OrganizationApplicationResponse = {} as OrganizationApplicationReadModel;
const _tbwd: OrganizationApplicationReadModel = {} as OrganizationApplicationResponse;
void _tfwd;
void _tbwd;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源。——
const _tav1: OrganizationApplicationView = {} as OrganizationApplicationReadModel;
const _tav2: OrganizationApplicationReadModel = {} as OrganizationApplicationView;
void _tav1;
void _tav2;

import type { TenantStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ApiProperty } from '@nestjs/swagger';
import type {
  ActiveTenantResult,
  TenantDirectoryEntryView,
  TenantDirectoryView,
} from '@saas/contracts/index';
import type {
  TenantDirectoryEntry,
  TenantDirectoryOrganization,
} from '../../domain/repositories/tenant-directory.repository';
import { TENANT_STATUS_ENUM } from './organization-application.response';

/**
 * 租户目录·组织条目响应（二级·归属标签·global-tenant-organization-rehierarchy 切片 E-F）。
 * @public
 */
export class TenantDirectoryOrganizationResponse {
  @ApiProperty({ description: '组织主键（二级轴·绑一家 Odoo 公司）。' })
  organizationId!: string;
  @ApiProperty({ description: '组织名称。' })
  name!: string;
  @ApiProperty({ description: '组织 slug。' })
  slug!: string;
}

/**
 * 租户目录·租户条目响应（顶层·隔离与计费边界）。
 * @public
 */
export class TenantDirectoryEntryResponse {
  @ApiProperty({ description: '租户主键（隔离主轴）。' })
  tenantId!: string;
  @ApiProperty({ description: '租户名称。' })
  name!: string;
  @ApiProperty({ description: '租户 slug。' })
  slug!: string;
  @ApiProperty({ enum: TENANT_STATUS_ENUM, description: '租户准入态。' })
  status!: TenantStatus;
  @ApiProperty({
    type: () => [TenantDirectoryOrganizationResponse],
    description: '该租户下当前用户可见的组织集合。',
  })
  organizations!: TenantDirectoryOrganizationResponse[];
}

/**
 * 租户目录整体响应（`GET /tenants` 信封 data 面）。
 * @public
 */
export class TenantDirectoryResponse {
  @ApiProperty({
    type: () => [TenantDirectoryEntryResponse],
    description: '当前用户可见的租户目录（每租携其下组织集合）。',
  })
  tenants!: TenantDirectoryEntryResponse[];
}

/**
 * 会话活动租户设置回执响应（`PUT /tenants/active`·第三次层级复裁 切片 4·D7）。
 * @public
 */
export class ActiveTenantResponse {
  @ApiProperty({ description: '已激活的租级租户 id（写入会话 activeTenantId）。' })
  tenantId!: string;
}

// —— 编译期双向对拍：response 类与真相源领域条目、contracts zod 单源输出型三者恒等，任一漂移 tsc 红。——
const _d1: TenantDirectoryEntry = {} as TenantDirectoryEntryResponse;
const _d2: TenantDirectoryEntryResponse = {} as TenantDirectoryEntry;
const _d3: TenantDirectoryOrganization = {} as TenantDirectoryOrganizationResponse;
const _d4: TenantDirectoryOrganizationResponse = {} as TenantDirectoryOrganization;
const _v1: TenantDirectoryView = {} as TenantDirectoryResponse;
const _v2: TenantDirectoryResponse = {} as TenantDirectoryView;
const _v3: TenantDirectoryEntryView = {} as TenantDirectoryEntry;
// 第三次复裁切片 4·D7：活动租户回执与 contracts 单源型双向对拍。
const _a1: ActiveTenantResult = {} as ActiveTenantResponse;
const _a2: ActiveTenantResponse = {} as ActiveTenantResult;
void _d1;
void _d2;
void _d3;
void _d4;
void _v1;
void _v2;
void _v3;
void _a1;
void _a2;

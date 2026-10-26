import type { TenancyStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { OrganizationOdooBindingStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import type { UserStatus } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { OrgVisibility } from '@core/saas-kit/modules/organizations/visibility/org-visibility';
import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { ApiProperty } from '@nestjs/swagger';
import type {
  organizationDiagnosticsSchema,
  PlatformTenantRowView,
  PlatformUserRowView,
  platformTenantDetailSchema,
  platformTenantPageSchema,
  platformUserPageSchema,
  tenantGovernanceResultSchema,
  tenantHardDeleteResultSchema,
  userGovernanceResultSchema,
} from '@saas/contracts/index';
import { ORG_VISIBILITY_VALUES } from '@saas/contracts/index';
import type { z } from 'zod';
import type { UserGovernanceResult } from '../../../organizations/application/read-models/platform-user.read-model';
import type {
  TenantGovernanceResult,
  TenantHardDeleteResult,
  TenantOrgVisibilityResult,
} from '../../../organizations/application/read-models/tenant-governance.read-model';
import type {
  OrganizationDiagnostics,
  PlatformOrganizationDrillRow,
  PlatformTenantDetail,
  PlatformTenantRow,
  TenantOrganizationEntry,
} from '../../../organizations/domain/repositories/organization-governance.repository';
import type { PlatformUserRow } from '../../../organizations/domain/repositories/user-governance.repository';

const STATUS_VALUES = Object.values(TENANCY_STATUS);

/**
 * 平台治理面租户列表行响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 *
 * @remarks
 * 真相源 = 各 controller 实际返回类型（platform-tenants / platform-users）；
 * 漂移防线：文末编译期双向赋值锁（tsc 结构恒等·build 拓红），非 runtime 测。
 * 状态枚举复用 `@core` TENANCY_STATUS 单源（UserStatus ≡ TenancyStatus 别名）。
 * rehierarchy 片一（治理台改锚 tenant·准入态归位）：跨租治理行升为 **tenant 主键**（准入态权威住 `tenant.status`·名下组织计数）。
 * @public
 */
export class PlatformTenantRowResponse {
  /** 租户主键（隔离与计费边界）。 */
  @ApiProperty({ description: 'tenant 主键。' })
  tenantId!: string;

  /** 租户名称。 */
  @ApiProperty()
  name!: string;

  /** URL 友好的短标识。 */
  @ApiProperty()
  slug!: string;

  /** 租户准入生命周期状态。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '准入态（无记录视同 active）。' })
  status!: TenancyStatus;

  /** 该租户名下组织数量。 */
  @ApiProperty({ description: '名下组织数量（一租多组织可见）。' })
  organizationCount!: number;

  /** 创建时间。 */
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

const _ptrf: PlatformTenantRowResponse = {} as PlatformTenantRow;
const _ptrb: PlatformTenantRow = {} as PlatformTenantRowResponse;
void _ptrf;
void _ptrb;

/**
 * 平台租户 offset 分页整体响应契约（`PlatformTenantPage = Page<PlatformTenantRow>`·整个分页对象裹入 data）。
 * @public
 */
export class PlatformTenantPageResponse {
  /** 当前页数据条目。 */
  @ApiProperty({ isArray: true, type: () => PlatformTenantRowResponse })
  items!: PlatformTenantRowResponse[];

  /** 总条数。 */
  @ApiProperty({ description: '全量行数。' })
  total!: number;

  /** 每页数量上限。 */
  @ApiProperty({ description: '回显页宽。' })
  limit!: number;

  /** 分页偏移量。 */
  @ApiProperty({ description: '回显偏移。' })
  offset!: number;
}

const _ptpf: PlatformTenantPageResponse = {} as Page<PlatformTenantRow>;
const _ptpb: Page<PlatformTenantRow> = {} as PlatformTenantPageResponse;
void _ptpf;
void _ptpb;

/**
 * 租户名册下组织条目响应契约（下钻/绑定面·一组织一公司·Odoo 绑定列可空）。
 * @public
 */
export class PlatformTenantOrganizationResponse {
  /** 组织主键。 */
  @ApiProperty({ description: 'organization 主键。' })
  organizationId!: string;

  /** 组织名称。 */
  @ApiProperty()
  name!: string;

  /** URL 友好的短标识。 */
  @ApiProperty()
  slug!: string;

  /** 组织自有轻量态（canUseOdoo 裁决用·非准入态）。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '组织自有态。' })
  status!: TenancyStatus;

  /** 绑定的 Odoo 公司 id（未绑定 null）。 */
  @ApiProperty({ nullable: true, description: '绑定的 Odoo 公司 id（未绑定为 null）。' })
  odooCompanyId!: number | null;

  /** Odoo 绑定生命周期态（未绑定 null）。 */
  @ApiProperty({ nullable: true, description: 'Odoo 绑定态（未绑定为 null）。' })
  odooBindingStatus!: OrganizationOdooBindingStatus | null;

  /** Odoo 公司名快照（未绑定 null）。 */
  @ApiProperty({ nullable: true, description: 'Odoo 公司名快照（未绑定为 null）。' })
  odooCompanyName!: string | null;
}

const _ptorf: PlatformTenantOrganizationResponse = {} as TenantOrganizationEntry;
const _ptorb: TenantOrganizationEntry = {} as PlatformTenantOrganizationResponse;
void _ptorf;
void _ptorb;

/**
 * 平台租户详情响应契约（tenant 基本盘 + 名下组织名册）。
 * @public
 */
export class PlatformTenantDetailResponse {
  /** 租户主键。 */
  @ApiProperty({ description: 'tenant 主键。' })
  tenantId!: string;

  /** 租户名称。 */
  @ApiProperty()
  name!: string;

  /** URL 友好的短标识。 */
  @ApiProperty()
  slug!: string;

  /** 租户准入生命周期状态。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '准入态（无记录视同 active）。' })
  status!: TenancyStatus;

  /** 创建时间。 */
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  /** 名下组织名册。 */
  @ApiProperty({ isArray: true, type: () => PlatformTenantOrganizationResponse })
  organizations!: PlatformTenantOrganizationResponse[];
}

const _ptdrf: PlatformTenantDetailResponse = {} as PlatformTenantDetail;
const _ptdrb: PlatformTenantDetail = {} as PlatformTenantDetailResponse;
void _ptdrf;
void _ptdrb;

/**
 * 组织身份下钻行响应契约（诊断快照 organization 段·治理台以 tenant 锚定后的 org 级轻形）。
 * @public
 */
export class PlatformOrganizationDrillRowResponse {
  /** 组织主键。 */
  @ApiProperty({ description: 'organization 主键。' })
  organizationId!: string;

  /** 组织名称。 */
  @ApiProperty()
  name!: string;

  /** URL 友好的短标识。 */
  @ApiProperty()
  slug!: string;

  /** 组织生命周期状态。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '组织态（无记录视同 active）。' })
  status!: TenancyStatus;

  /** 创建时间。 */
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

const _pdrf: PlatformOrganizationDrillRowResponse = {} as PlatformOrganizationDrillRow;
const _pdrb: PlatformOrganizationDrillRow = {} as PlatformOrganizationDrillRowResponse;
void _pdrf;
void _pdrb;

/**
 * 单组织诊断响应契约（成员/邀请/工作区/帖子计数聚合·org 级下钻·经租户详情抵达）。
 * @public
 */
export class OrganizationDiagnosticsResponse {
  /** 所属组织下钻行。 */
  @ApiProperty({
    type: () => PlatformOrganizationDrillRowResponse,
    description: '组织下钻行。',
  })
  organization!: PlatformOrganizationDrillRowResponse;

  /** 成员数量。 */
  @ApiProperty({ description: '成员数。' })
  memberCount!: number;

  /** 邀请数量。 */
  @ApiProperty({ description: '待处理邀请数。' })
  invitationCount!: number;

  /** 工作区数量。 */
  @ApiProperty({ description: '工作区数。' })
  workspaceCount!: number;

  /** 文章数量。 */
  @ApiProperty({ description: '帖子数。' })
  postCount!: number;
}

const _tdf: OrganizationDiagnosticsResponse = {} as OrganizationDiagnostics;
const _tdb: OrganizationDiagnostics = {} as OrganizationDiagnosticsResponse;
void _tdf;
void _tdb;

/**
 * 租户生命周期治理结果响应契约（suspend/resume/delete 迁移后的新准入态）。
 * @public
 */
export class TenantGovernanceResultResponse {
  /** 目标租户 id。 */
  @ApiProperty({ description: '目标 tenant 主键。' })
  tenantId!: string;

  /** 迁移后的租户准入态。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '迁移后的准入态。' })
  status!: TenancyStatus;
}

const _tgrf: TenantGovernanceResultResponse = {} as TenantGovernanceResult;
const _tgrb: TenantGovernanceResult = {} as TenantGovernanceResultResponse;
void _tgrf;
void _tgrb;

/**
 * 租内跨组织可见性策略设置响应契约（第三次复裁切片 3·设置后的 `tenant.orgVisibility`）。
 * @public
 */
export class TenantOrgVisibilityResultResponse {
  /** 目标租户 id。 */
  @ApiProperty({ description: '目标 tenant 主键。' })
  tenantId!: string;

  /** 设置后的租内可见性策略。 */
  @ApiProperty({
    enum: ORG_VISIBILITY_VALUES,
    description: '设置后的租内跨组织可见性策略（shared 互见·isolated 互不可见）。',
  })
  orgVisibility!: OrgVisibility;
}

const _tovf: TenantOrgVisibilityResultResponse = {} as TenantOrgVisibilityResult;
const _tovb: TenantOrgVisibilityResult = {} as TenantOrgVisibilityResultResponse;
void _tovf;
void _tovb;

/**
 * 租户硬删连带结果响应契约（含本次连带消灭的组织行数与清除事件数供审计核对）。
 * @public
 */
export class TenantHardDeleteResultResponse {
  /** 被硬删的租户主键。 */
  @ApiProperty({ description: '被硬删的 tenant 主键。' })
  tenantId!: string;

  /** 本次连带消灭的组织行数。 */
  @ApiProperty({ description: '本次连带消灭的组织行数（一租多组织）。' })
  purgedOrgs!: number;

  /** 已清除的事件行数。 */
  @ApiProperty({ description: '本次清除的 lifecycle 事件数（供审计核对）。' })
  purgedEvents!: number;
}

const _thdf: TenantHardDeleteResultResponse = {} as TenantHardDeleteResult;
const _thdb: TenantHardDeleteResult = {} as TenantHardDeleteResultResponse;
void _thdf;
void _thdb;

/**
 * 平台用户行响应契约（单用户摘要行）。
 * @public
 */
export class PlatformUserRowResponse {
  /** 用户 id。 */
  @ApiProperty({ description: '用户主键。' })
  userId!: string;

  /** 用户显示名。 */
  @ApiProperty()
  name!: string;

  /** 邮箱地址。 */
  @ApiProperty()
  email!: string;

  /** 用户治理状态。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '治理状态（无记录视同 active）。' })
  status!: UserStatus;

  /** 创建时间。 */
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

const _purf: PlatformUserRowResponse = {} as PlatformUserRow;
const _purb: PlatformUserRow = {} as PlatformUserRowResponse;
void _purf;
void _purb;

/**
 * 平台用户 offset 分页整体响应契约（`PlatformUserPage = Page<PlatformUserRow>`）。
 * @public
 */
export class PlatformUserPageResponse {
  /** 当前页数据条目。 */
  @ApiProperty({ isArray: true, type: () => PlatformUserRowResponse })
  items!: PlatformUserRowResponse[];

  /** 总条数。 */
  @ApiProperty({ description: '全量行数。' })
  total!: number;

  /** 每页数量上限。 */
  @ApiProperty({ description: '回显页宽。' })
  limit!: number;

  /** 分页偏移量。 */
  @ApiProperty({ description: '回显偏移。' })
  offset!: number;
}

const _pupf: PlatformUserPageResponse = {} as Page<PlatformUserRow>;
const _pupb: Page<PlatformUserRow> = {} as PlatformUserPageResponse;
void _pupf;
void _pupb;

/**
 * 用户治理迁移结果响应契约（迁移后的新状态）。
 * @public
 */
export class UserGovernanceResultResponse {
  /** 用户 id。 */
  @ApiProperty({ description: '用户主键。' })
  userId!: string;

  /** 用户治理状态。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '迁移后的新状态。' })
  status!: UserStatus;
}

const _ugrf: UserGovernanceResultResponse = {} as UserGovernanceResult;
const _ugrb: UserGovernanceResult = {} as UserGovernanceResultResponse;
void _ugrf;
void _ugrb;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源（缺字段红；多字段由 strip 剥落）。——
const _pt1: PlatformTenantRowView = {} as PlatformTenantRow;
const _pt2: PlatformTenantRow = {} as PlatformTenantRowView;
const _gv1: PlatformUserRowView = {} as PlatformUserRow;
const _gv2: PlatformUserRow = {} as PlatformUserRowView;
const _td1: z.infer<typeof organizationDiagnosticsSchema> = {} as OrganizationDiagnostics;
const _td2: OrganizationDiagnostics = {} as z.infer<typeof organizationDiagnosticsSchema>;
const _tgr1: z.infer<typeof tenantGovernanceResultSchema> = {} as TenantGovernanceResult;
const _tgr2: TenantGovernanceResult = {} as z.infer<typeof tenantGovernanceResultSchema>;
const _hdr1: z.infer<typeof tenantHardDeleteResultSchema> = {} as TenantHardDeleteResult;
const _hdr2: TenantHardDeleteResult = {} as z.infer<typeof tenantHardDeleteResultSchema>;
const _hg1: z.infer<typeof userGovernanceResultSchema> = {} as UserGovernanceResult;
const _hg2: UserGovernanceResult = {} as z.infer<typeof userGovernanceResultSchema>;
const _tpg: Page<PlatformTenantRow> = {} as z.infer<typeof platformTenantPageSchema>;
const _upd: PlatformTenantDetail = {} as z.infer<typeof platformTenantDetailSchema>;
const _updb: z.infer<typeof platformTenantDetailSchema> = {} as PlatformTenantDetail;
const _upg: Page<PlatformUserRow> = {} as z.infer<typeof platformUserPageSchema>;
void _pt1;
void _pt2;
void _gv1;
void _gv2;
void _td1;
void _td2;
void _tgr1;
void _tgr2;
void _hdr1;
void _hdr2;
void _hg1;
void _hg2;
void _tpg;
void _upd;
void _updb;
void _upg;

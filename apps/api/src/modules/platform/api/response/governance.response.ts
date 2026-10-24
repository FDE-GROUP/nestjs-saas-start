import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { UserStatus } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { ApiProperty } from '@nestjs/swagger';
import type {
  organizationDiagnosticsSchema,
  organizationHardDeleteResultSchema,
  PlatformOrganizationRowView,
  PlatformUserRowView,
  platformOrganizationPageSchema,
  platformUserPageSchema,
  userGovernanceResultSchema,
} from '@saas/contracts/index';
import type { z } from 'zod';
import type { OrganizationHardDeleteResult } from '../../../organizations/application/commands/delete-organization-permanently.command';
import type { UserGovernanceResult } from '../../../organizations/application/read-models/platform-user.read-model';
import type {
  OrganizationDiagnostics,
  PlatformOrganizationRow,
} from '../../../organizations/domain/repositories/organization-governance.repository';
import type { PlatformUserRow } from '../../../organizations/domain/repositories/user-governance.repository';

const STATUS_VALUES = Object.values(ORGANIZATION_STATUS);

/**
 * 平台治理面单组织行响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 *
 * @remarks
 * 真相源 = 各 controller 实际返回类型（platform-tenants / platform-users）；
 * 漂移防线：文末编译期双向赋值锁（tsc 结构恒等·build 拓红），非 runtime 测。
 * 状态枚举复用 `@core` ORGANIZATION_STATUS 单源（UserStatus ≡ OrganizationStatus 别名）。
 * @public
 */
export class PlatformOrganizationRowResponse {
  /** 所属租户 id。 */
  @ApiProperty({ description: 'organization 主键。' })
  organizationId!: string;

  /** 租户名称。 */
  @ApiProperty()
  name!: string;

  /** URL 友好的短标识。 */
  @ApiProperty()
  slug!: string;

  /** 租户生命周期状态。 */
  @ApiProperty({ enum: STATUS_VALUES, description: '生命周期状态（无记录视同 active）。' })
  status!: OrganizationStatus;

  /** 创建时间。 */
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

// —— 编译期双向对拍：response 类与真相源结构恒等，任一侧漂移则 tsc 红。——
const _ptrf: PlatformOrganizationRowResponse = {} as PlatformOrganizationRow;
const _ptrb: PlatformOrganizationRow = {} as PlatformOrganizationRowResponse;
void _ptrf;
void _ptrb;

/**
 * 平台组织 offset 分页整体响应契约（`PlatformOrganizationPage = Page<PlatformOrganizationRow>`·整个分页对象裹入 data）。
 * @public
 */
export class PlatformOrganizationPageResponse {
  /** 当前页数据条目。 */
  @ApiProperty({ isArray: true, type: () => PlatformOrganizationRowResponse })
  items!: PlatformOrganizationRowResponse[];

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

const _ptpf: PlatformOrganizationPageResponse = {} as Page<PlatformOrganizationRow>;
const _ptpb: Page<PlatformOrganizationRow> = {} as PlatformOrganizationPageResponse;
void _ptpf;
void _ptpb;

/**
 * 单组织诊断响应契约（成员/邀请/工作区/帖子计数聚合）。
 * @public
 */
export class OrganizationDiagnosticsResponse {
  /** 所属租户行。 */
  @ApiProperty({ type: () => PlatformOrganizationRowResponse, description: '组织行。' })
  organization!: PlatformOrganizationRowResponse;

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
 * 组织硬删结果响应契约（含本次清除的事件数供审计核对）。
 * @public
 */
export class OrganizationHardDeleteResultResponse {
  /** 所属租户 id。 */
  @ApiProperty({ description: '被硬删的 organization 主键。' })
  organizationId!: string;

  /** 已清除的事件行数。 */
  @ApiProperty({ description: '本次清除的 lifecycle 事件数（供审计核对）。' })
  purgedEvents!: number;
}

const _thdf: OrganizationHardDeleteResultResponse = {} as OrganizationHardDeleteResult;
const _thdb: OrganizationHardDeleteResult = {} as OrganizationHardDeleteResultResponse;
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
const _pt1: PlatformOrganizationRowView = {} as PlatformOrganizationRow;
const _pt2: PlatformOrganizationRow = {} as PlatformOrganizationRowView;
const _gv1: PlatformUserRowView = {} as PlatformUserRow;
const _gv2: PlatformUserRow = {} as PlatformUserRowView;
const _td1: z.infer<typeof organizationDiagnosticsSchema> = {} as OrganizationDiagnostics;
const _td2: OrganizationDiagnostics = {} as z.infer<typeof organizationDiagnosticsSchema>;
const _hd1: z.infer<typeof organizationHardDeleteResultSchema> = {} as OrganizationHardDeleteResult;
const _hd2: OrganizationHardDeleteResult = {} as z.infer<typeof organizationHardDeleteResultSchema>;
const _hg1: z.infer<typeof userGovernanceResultSchema> = {} as UserGovernanceResult;
const _hg2: UserGovernanceResult = {} as z.infer<typeof userGovernanceResultSchema>;
const _tpg: Page<PlatformOrganizationRow> = {} as z.infer<typeof platformOrganizationPageSchema>;
const _upg: Page<PlatformUserRow> = {} as z.infer<typeof platformUserPageSchema>;
void _pt1;
void _pt2;
void _gv1;
void _gv2;
void _td1;
void _td2;
void _hd1;
void _hd2;
void _hg1;
void _hg2;
void _tpg;
void _upg;

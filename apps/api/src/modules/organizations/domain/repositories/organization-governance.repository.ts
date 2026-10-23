import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { Page, PageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';

/**
 * Platform governance repository port (domain-owned · global-tenancy S5 · FR-6).
 *
 * 跨租户运营视图的唯一数据卡点：仅经 `PlatformOperatorGuard` 裁决后的平台级查询/治理
 * 使用——**刻意不做租户过滤**（平台级天然跨租户，FR-11①），因此该 port 绝不允许被
 * 租户级切片引用（守卫在 controller 逐路由接线，fail-closed）。
 *
 * 状态迁移（suspend/resume/delete）不在此 port——统一走 `OrganizationStatusService.transition`
 * （户籍表 `tenant.status` 单点·§9.4 迁移表）；此处只保留行级读与硬删（deleted 终态后的运维硬删留接口）。
 */
export const ORGANIZATION_GOVERNANCE_REPOSITORY = Symbol('ORGANIZATION_GOVERNANCE_REPOSITORY');

export interface PlatformOrganizationRow {
  organizationId: string;
  name: string;
  slug: string;
  /** 无状态记录（存量/seeded）视同 active（与 canTransition/middleware deny-list 同口径）。 */
  status: OrganizationStatus;
  createdAt: Date;
}

/**
 * 分页形状收敛到 shared-kernel 泛型契约（module-common-pagination-contract · 乙裁：
 * 旧名留作别名，消费方 import 面不动，随重构自然淘汰）。
 */
export type PlatformOrganizationPage = Page<PlatformOrganizationRow>;

/** 按租户诊断（FR-6）：租户行 + 关联数据量，供经营者一眼判断租户实况。 */
export interface OrganizationDiagnostics {
  organization: PlatformOrganizationRow;
  memberCount: number;
  invitationCount: number;
  workspaceCount: number;
  postCount: number;
}

/**
 * 租户级数据导出（NFR-6 · GDPR 按租户可携）：成员名册行的最小身份面——
 * 仅 id/name/email/handle 四项，**绝不携带 password/account/session 凭据**
 *（对齐 users 侧 user-data-export.read-model 的 SECURITY 纪律）。
 */
export interface ExportedOrganizationUser {
  id: string;
  name: string;
  email: string;
  handle: string;
}

export interface ExportedOrganizationMember {
  id: string;
  role: string;
  createdAt: Date;
  user: ExportedOrganizationUser;
}

/**
 * 按租户导出 payload（六段聚合·SSOT = organizationId 归属可导表）。
 * `tenant` 为 organization 全列 + 户籍态 `status`（收权案切片 B：态在 `tenant.status` 真列·
 * `metadata` 全列透传零我方键）；deleted 终态租户亦可导出
 *（S5 软删「保留行供按租户导出/硬删」的取证用途·查询面刻意不按 status 过滤）。
 */
export interface OrganizationDataExport {
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    /** 生命周期态（`tenant.status` 真列·无户籍兑底 active·与列表行同口径）。 */
    status: OrganizationStatus;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date | null;
  };
  members: ExportedOrganizationMember[];
  invitations: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    inviterId: string;
    createdAt: Date;
  }[];
  workspaces: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
  subscriptions: {
    id: string;
    plan: string;
    status: string;
    seatsLimit: number;
    storageQuota: number | null;
    apiQuota: number | null;
    periodStart: Date;
    periodEnd: Date | null;
    provider: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  posts: {
    id: string;
    title: string;
    content: string | null;
    published: boolean;
    workspaceId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
}

export interface OrganizationGovernanceRepository {
  /** 跨租户列表（name/slug 模糊过滤·createdAt 倒序·limit/offset 分页）。 */
  list(opts: PageRequest & { search?: string }): Promise<PlatformOrganizationPage>;
  /** 租户详情；不存在 → null（调用方转 404）。 */
  findById(organizationId: string): Promise<PlatformOrganizationRow | null>;
  /** 按租户诊断（成员/邀请/workspace/帖子计数）；不存在 → null。 */
  diagnostics(organizationId: string): Promise<OrganizationDiagnostics | null>;
  /** 按租户导出全部名下数据（NFR-6）；不存在 → null。deleted 终态亦可导。 */
  exportOrganizationData(organizationId: string): Promise<OrganizationDataExport | null>;
  /**
   * 运营硬删（NFR-6 删除半）：仅删 organization 主行，五张子表由 DB FK cascade
   * 自动消灭（单一卡点·应用层不逐表删）；实删 → true，行不存在 → false。
   * **前置闸（仅 deleted 终态可硬删）在 application 层 handler 裁决**，访问控管在
   * controller guard——本 port 供纯粹消灭动作，不叠业务门槛（与 diagnostics 同位阶）。
   */
  destroy(organizationId: string): Promise<boolean>;
}

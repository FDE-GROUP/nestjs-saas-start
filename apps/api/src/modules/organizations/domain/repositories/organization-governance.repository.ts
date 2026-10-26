import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { OrganizationOdooBindingStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import type { Page, PageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';

/**
 * 平台租户治理仓储端口的 DI 注入 token。
 * @public
 */
export const ORGANIZATION_GOVERNANCE_REPOSITORY = Symbol('ORGANIZATION_GOVERNANCE_REPOSITORY');

/**
 * 跨租治理列表行（**tenant 主键**·准入态权威·名下组织计数）。
 * @public
 */
export interface PlatformTenantRow {
  /** 租户主键（隔离与计费边界）。 */
  tenantId: string;
  /** 租户名称。 */
  name: string;
  /** URL 友好的短标识。 */
  slug: string;
  /** 租户准入生命周期态（无记录视同 active·与 canTransition/deny-list 同口径）。 */
  status: OrganizationStatus;
  /** 该租户名下组织数量（一租多组织可见）。 */
  organizationCount: number;
  /** 创建时间。 */
  createdAt: Date;
}

/**
 * 租户名册下的组织条目（下钻/绑定面·一组织一公司）。Odoo 绑定列未绑定时为 null。
 * @public
 */
export interface TenantOrganizationEntry {
  /** 组织主键。 */
  organizationId: string;
  name: string;
  slug: string;
  /** 组织自有轻量态（canUseOdoo 裁决用·非准入态）。 */
  status: OrganizationStatus;
  odooCompanyId: number | null;
  odooBindingStatus: OrganizationOdooBindingStatus | null;
  odooCompanyName: string | null;
}

/**
 * 租户详情（tenant 基本盘 + 名下组织名册）。
 * @public
 */
export interface PlatformTenantDetail {
  tenantId: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: Date;
  organizations: TenantOrganizationEntry[];
}

/**
 * 分页形状收敛到 shared-kernel 泛型契约（module-common-pagination-contract · 乙裁：
 * 旧名留作别名，消费方 import 面不动，随重构自然淘汰）。
 * @public
 */
export type PlatformTenantPage = Page<PlatformTenantRow>;

/**
 * 组织身份下钻行（`OrganizationDiagnostics.organization` 段·治理台以 tenant 锚定后仅留此轻形供 org 级诊断）。
 * @public
 */
export interface PlatformOrganizationDrillRow {
  /** 组织主键。 */
  organizationId: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdAt: Date;
}

/**
 * 按组织诊断（FR-6）：组织行 + 关联数据量，供经营者一眼判断组织实况（org 级下钻·经租户详情抵达）。
 * @public
 */
export interface OrganizationDiagnostics {
  /** 所属组织行。 */
  organization: PlatformOrganizationDrillRow;
  /** 成员数量。 */
  memberCount: number;
  /** 邀请数量。 */
  invitationCount: number;
  /** 工作区数量。 */
  workspaceCount: number;
  /** 文章数量。 */
  postCount: number;
}

/**
 * 租户级数据导出（NFR-6 · GDPR 按租户可携）：成员名册行的最小身份面。
 *
 * @remarks
 * 仅 id/name/email/handle 四项，**绝不携带 password/account/session 凭据**
 *（对齐 users 侧 user-data-export.read-model 的 SECURITY 纪律）。
 * @public
 */
export interface ExportedOrganizationUser {
  /** 导出用户行 id。 */
  id: string;
  /** 用户显示名。 */
  name: string;
  /** 邮箱地址。 */
  email: string;
  /** 用户名/句柄（唯一标识）。 */
  handle: string;
}

/**
 * 导出面成员行（角色 + 加入时间 + 最小身份面）。
 * @public
 */
export interface ExportedOrganizationMember {
  /** 导出成员行 id。 */
  id: string;
  /** 成员在该租户的角色。 */
  role: string;
  /** 创建时间。 */
  createdAt: Date;
  /** 所属用户。 */
  user: ExportedOrganizationUser;
}

/**
 * 按租户导出 payload（六段聚合·SSOT = organizationId 归属可导表）。
 *
 * @remarks
 * `organization` 为本体全列 + 治理态 `status`（consolidation 切片 B：态在 `organization.status`
 * 真列·原 `tenant` 旁表已 DROP·`metadata` 全列透传零我方键）；deleted 终态租户亦可导出
 *（S5 软删「保留行供按租户导出/硬删」的取证用途·查询面刻意不按 status 过滤）。
 * @public
 */
export interface OrganizationDataExport {
  /** 所属租户行。 */
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    /** 生命周期态（`organization.status` 真列·列缺省兑底 active·与列表行同口径）。 */
    status: OrganizationStatus;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date | null;
  };
  /** 成员记录集合。 */
  members: ExportedOrganizationMember[];
  /** 邀请记录集合。 */
  invitations: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    inviterId: string;
    createdAt: Date;
  }[];
  /** 工作区记录集合。 */
  workspaces: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
  /** 订阅记录集合。 */
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
  /** 文章记录集合。 */
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

/**
 * 平台租户治理仓储端口（domain-owned · global-tenancy S5 · FR-6）。
 *
 * @remarks
 * 跨租户运营视图的唯一数据卡点：仅经 `PlatformOperatorGuard` 裁决后的平台级查询/治理
 * 使用——**刻意不做租户过滤**（平台级天然跨租户，FR-11①），因此该 port 绝不允许被
 * 租户级切片引用（守卫在 controller 逐路由接线，fail-closed）。
 *
 * 状态迁移（approve/suspend/resume/delete）不在此 port——统一走 `TenantStatusService.transition`（rehierarchy 片一治理换轴归位：准入态权威上移 `tenant.status` 真列单点·§9.4 迁移表）；此处只保留行级读与硬删连带（deleted 终态后的运维硬删留接口）。
 * @public
 */
export interface OrganizationGovernanceRepository {
  /**
   * 跨租租户列表（**tenant 主键**·name/slug 模糊过滤·createdAt 倒序·limit/offset 分页·每行携名下组织计数）。
   * @param opts - 分页请求 + 可选搜索串。
   * @returns 租户行分页页。
   */
  listTenants(opts: PageRequest & { search?: string }): Promise<PlatformTenantPage>;
  /**
   * 租户详情（tenant 基本盘 + 名下组织名册）；不存在 → null（调用方转 404）。
   * @param tenantId - 目标租户 id。
   * @returns 租户详情；查无时为 `null`。
   */
  findTenantDetail(tenantId: string): Promise<PlatformTenantDetail | null>;
  /**
   * 按组织诊断（成员/邀请/workspace/帖子计数）；不存在 → null。org 级下钻·经租户详情抵达。
   * @param organizationId - 目标组织 id。
   * @returns 诊断快照；查无时为 `null`。
   */
  diagnostics(organizationId: string): Promise<OrganizationDiagnostics | null>;
  /**
   * 按组织导出全部名下数据（NFR-6）；不存在 → null。deleted 终态亦可导。
   * @param organizationId - 目标组织 id。
   * @returns 六段聚合导出体；查无时为 `null`。
   */
  exportOrganizationData(organizationId: string): Promise<OrganizationDataExport | null>;
  /**
   * 租户硬删连带（NFR-6 删除半）：清除该租户名下**所有组织**（含 1:1 骨架自持租户 id==org.id 那一组）
   * + 租户行 + 名下订阅行；各子表由 DB FK cascade 自动消灭。
   *
   * @remarks
   * 单一卡点·应用层不逐表删；**前置闸（仅 tenant.status——准入态归位单点——处 deleted 终态可硬删）在 application 层 handler 裁决**，
   * 访问控管在 controller guard——本 port 供纯粹连带消灭动作，不叠业务门槛。事件补删归 handler（需 eventStore）。
   * @param tenantId - 目标租户 id。
   * @returns `purgedOrgs`＝本次连带消灭的组织行数（0 表示租户本体不存在·调用方转 404 幂等）。
   */
  destroyTenant(tenantId: string): Promise<{ purgedOrgs: number }>;
  /**
   * 组织准入态读取（bind 门槛用·rehierarchy 片一修读侧叠加键）：经 `organization.tenantId ?? id` 解析所属
   * 租户的 `tenant.status`（准入态权威归位·companion org 正确取租户态·非恒 active）；组织不存在 → null（控制层 404）。
   * @param organizationId - 目标组织 id。
   * @returns 所属租户准入态；组织查无时为 `null`。
   */
  findOrganizationAdmission(organizationId: string): Promise<OrganizationStatus | null>;
  /**
   * bind-existing 回填（module-org-odoo-company-mapping 切片 A）：把现存 Odoo 公司绑定到组织，
   * 绑定态直落 `ready`（回填系人工确认动作，无 provisioning 中间态）。
   *
   * @remarks
   * 一公司只归一组织：应用层预检查（占用人查存）+ `odooCompanyId` 库级 unique 双防线；
   * 本 port 不验公司在 Odoo 侧存在性（跨库弱引用·正向核验归 doctor，切片 C）。
   * @param organizationId - 目标租户 id。
   * @param input - 公司 id + 名称快照。
   * @returns `not-found`（租户查无）/ `conflict`（公司已被其它租户占用）/ `bound`（回执档案）。
   */
  bindOdooCompany(
    organizationId: string,
    input: { odooCompanyId: number; odooCompanyName: string },
  ): Promise<BindOdooCompanyOutcome>;
}

/**
 * 租户↔Odoo 公司绑定档案（映射行读面·双库平行映射的 SaaS 侧 SSOT）。
 * @public
 */
export interface OrganizationOdooBindingRecord {
  /** 所属租户 id。 */
  organizationId: string;
  /** 绑定的 Odoo 公司 id（跨库弱引用，无 FK）。 */
  odooCompanyId: number;
  /** 绑定生命周期态。 */
  odooBindingStatus: OrganizationOdooBindingStatus;
  /** 公司名快照（denormalize）。 */
  odooCompanyName: string | null;
  /** 绑定确立时间。 */
  odooBoundAt: Date | null;
  /** 租户治理态（可选携·供 `@core` reader 端口转形与 `canUseOdoo` 裁决；bind 回执不填）。 */
  organizationStatus?: OrganizationStatus;
}

/**
 * bind-existing 三分支结局（判别子联合·禁布尔糊合 not-found 与 conflict）。
 * @public
 */
export type BindOdooCompanyOutcome =
  | { kind: 'not-found' }
  | { kind: 'conflict' }
  | { kind: 'bound'; binding: OrganizationOdooBindingRecord };

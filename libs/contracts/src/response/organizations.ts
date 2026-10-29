import { z } from 'zod';

/**
 * 租户生命周期状态 wire 值集（**传输层内联单源**）。
 *
 * @remarks
 * ⚠ 状态值域 SSOT 在 `@core` TENANT_STATUS·此处内联字面量由 contracts-vocab-parity 对拍锁漂移。
 *
 * @public
 */
export const TENANT_STATUS_VALUES = ['pending_approval', 'active', 'suspended', 'deleted'] as const;

/**
 * 租内跨组织可见性策略 wire 值集（**传输层内联单源**·第三次复裁切片 3）。
 *
 * @remarks
 * ⚠ 值域 SSOT 在 `@core` ORG_VISIBILITY·此处内联字面量由 contracts-vocab-parity 对拍锁漂移（沿
 * `TENANT_STATUS_VALUES` 同法）。`shared`=同租内跨组织默认互见（缺省·零行为变更）·`isolated`=租内互不可见。
 *
 * @public
 */
export const ORG_VISIBILITY_VALUES = ['shared', 'isolated'] as const;

/**
 * 租户申请/生命周期视图（S7b·真相源 = `OrganizationApplicationReadModel`·
 * 复用于 tenants apply/approve + platform suspend/resume/delete）。
 *
 * @public
 */
export const organizationApplicationViewSchema = z.object({
  /** organization 主键（= 租户 id）。 */
  organizationId: z.string(),
  status: z.enum(TENANT_STATUS_VALUES),
});
export type OrganizationApplicationView = z.infer<typeof organizationApplicationViewSchema>;

/**
 * Odoo 公司绑定态 wire 值集（**传输层内联单源**）。
 *
 * @remarks
 * ⚠ 状态值域 SSOT 在 `@core` ORGANIZATION_ODOO_BINDING_STATUS·此处内联字面量由
 * contracts-vocab-parity 对拍锁漂移（沿 `TENANT_STATUS_VALUES` 同法）。
 *
 * @public
 */
export const ORGANIZATION_ODOO_BINDING_STATUS_VALUES = [
  'pending',
  'provisioning',
  'ready',
  'failed',
] as const;

/**
 * 租户↔Odoo 公司绑定视图（module-org-odoo-company-mapping 切片 A·bind-existing 回执）。
 *
 * @remarks
 * 真相源 = `OrganizationOdooBindingReadModel`；只暴露映射档案，
 * 公司实体数据（单据/伙伴等）仍走 odoo-rpc-api 域注入面，不经本视图透传。
 *
 * @public
 */
export const organizationOdooBindingViewSchema = z.object({
  organizationId: z.string(),
  odooCompanyId: z.number().int().positive(),
  odooBindingStatus: z.enum(ORGANIZATION_ODOO_BINDING_STATUS_VALUES),
  odooCompanyName: z.string().nullable(),
  odooBoundAt: z.instanceof(Date).nullable(),
});
export type OrganizationOdooBindingView = z.infer<typeof organizationOdooBindingViewSchema>;

/**
 * 当前活跃租户的 Odoo 可用性视图（module-org-odoo-company-mapping 切片 D · apps 面板数据源）。
 *
 * @remarks
 * 前端 apps 面板按绑定态渲染（可用/开通中/失败/未开通）的唯一读面；`available`
 * 与后端 SSO/RPC 门禁同一 `canUseOdoo` 单源裁决（三点门禁口径不漂移）。字段均为只读展示用·
 * `odooBindingStatus=null` 表未绑定（存量/演示行）。**不**含公司实体数据（走 odoo-rpc-api 域注入面）。
 *
 * @public
 */
export const organizationOdooAvailabilityViewSchema = z.object({
  /** Odoo 能力当前对该租户是否可用（`canUseOdoo` 裁决结果）。 */
  available: z.boolean(),
  /** 绑定生命周期态（null=未绑定/无活跃租户）。 */
  odooBindingStatus: z.enum(ORGANIZATION_ODOO_BINDING_STATUS_VALUES).nullable(),
  /** 绑定的 Odoo 公司 id（无绑定即 null）。 */
  odooCompanyId: z.number().int().positive().nullable(),
});
export type OrganizationOdooAvailabilityView = z.infer<
  typeof organizationOdooAvailabilityViewSchema
>;

/**
 * 通用写操作回执（M4-b 响应面建模·organizations 六个变更类 op 共用）。
 *
 * @remarks
 * 承 `@saas/api-contract` 各面 handler 实返 `{ ok: true }`（leave/reject/updateRole/removeMember/create/cancel）。
 * 本件为**文档/客户端型契约 + 服务端校验**（`.output` 供 openapi 回填 + router 派生型）；@Impl 双侧同挂本件，
 * handler 侧真跑 parse（`{ ok: true }` 字面量命中·返回同形）。
 *
 * @public
 */
export const okResponseSchema = z.object({ ok: z.literal(true) });

/**
 * 租级成员行视图（↔ `TenantMemberView` 端口·只读展示四字段）。
 * @public
 */
export const tenantMemberViewSchema = z.object({
  /** 成员用户 id（租级成员定位键）。 */
  userId: z.string(),
  /** 用户邮箱（join user）。 */
  email: z.string(),
  /** 用户名（join user）。 */
  name: z.string(),
  /** 本租分配的角色 key（无分配行 → `member` 缺省）。 */
  roleKey: z.string(),
});

/** 租级成员列表响应（↔ `listMembers(): TenantMemberView[]`·沿 `tenantRoleGrantViewListSchema` 具名 list 件先例）。 @public */
export const tenantMemberViewListSchema = z.array(tenantMemberViewSchema);

/**
 * 租级邀请行视图（↔ `TenantInvitationView` 端口）。
 *
 * @remarks
 * `status` 源端口无值域 enum 型（仅注释述 pending/accepted/cancelled/expired）→ 采 `z.string()`
 * 不臆造值域（防无对拍闸保护的承诺漂移）；`expiresAt`/`createdAt` 取 `z.instanceof(Date)` 沿 page.ts 先例
 * （序列化出线为 ISO 串·客户端 reviving 还原 Date）。
 *
 * @public
 */
export const tenantInvitationViewSchema = z.object({
  /** 邀请行 id。 */
  id: z.string(),
  /** 所属租户 id。 */
  tenantId: z.string(),
  /** 受邀邮箱。 */
  email: z.string(),
  /** 授予角色 key。 */
  roleKey: z.string(),
  /** 邀请人用户 id（可空·系统动作）。 */
  invitorId: z.string().nullable(),
  /** 状态（无值域 enum 型·见 @remarks）。 */
  status: z.string(),
  /** 过期时刻（可空·不过期）。 */
  expiresAt: z.instanceof(Date).nullable(),
  /** 创建时刻。 */
  createdAt: z.instanceof(Date),
});

/** 租级邀请列表响应（↔ `listInvitations()/listMyInvitations(): TenantInvitationView[]`）。 @public */
export const tenantInvitationViewListSchema = z.array(tenantInvitationViewSchema);

/**
 * 接受邀请入租回执（↔ `TenantMemberFacadeService.acceptInvitation` 返回 `{ tenantId, roleKey }`）。
 * @public
 */
export const acceptInvitationResultSchema = z.object({
  /** 入落的活动租户 id。 */
  tenantId: z.string(),
  /** 本次授予的角色 key。 */
  roleKey: z.string(),
});

/**
 * 平台租户-组织导出体（↔ `OrganizationDataExport`·裁点④**顶层骨架·防脆**）。
 *
 * @remarks
 * 只锁顶层六键形状，内层（成员/邀请/工作区/订阅/文章记录集）采 `z.array(z.unknown())` free-form：导出面字段随
 * ORM/领域演化，严格逐字段会脆断，且内层记录为具名接口（无索引签名·不可赋 `Record<string, unknown>`）。@Impl 双侧
 * 同挂本件 → handler 侧真跑 parse：仅校顶层六键存在，内层 free-form 逐字透传不剥（不产生 PII 泄露新面·裁点③）。
 *
 * @public
 */
export const organizationDataExportViewSchema = z.object({
  /** 所属租户行。 */
  organization: z.record(z.string(), z.unknown()),
  /** 成员记录集合（内层 free-form·防脆）。 */
  members: z.array(z.unknown()),
  /** 邀请记录集合（内层 free-form·防脆）。 */
  invitations: z.array(z.unknown()),
  /** 工作区记录集合（内层 free-form·防脆）。 */
  workspaces: z.array(z.unknown()),
  /** 订阅记录集合（内层 free-form·防脆）。 */
  subscriptions: z.array(z.unknown()),
  /** 文章记录集合（内层 free-form·防脆）。 */
  posts: z.array(z.unknown()),
});

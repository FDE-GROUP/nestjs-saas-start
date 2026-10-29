import { z } from 'zod';
import { reqStringMax } from '../helpers';
import { strictObject } from '../strict';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * 申请创建租户入参（旧 `CreateOrganizationApplicationDto`·口径同 workspace）。
 *
 * @public
 */
export const createOrganizationApplicationSchema = strictObject({
  name: reqStringMax('validate.name.required', 200),
  slug: reqStringMax('validate.slug.required', 128).regex(SLUG_PATTERN, {
    error: 'validate.slug.invalid',
  }),
});
export type CreateOrganizationApplication = z.infer<typeof createOrganizationApplicationSchema>;

/**
 * 更新租户成员角色入参（旧 `tenants-org.dto.ts` 六类之一·对齐 BA 内置端点 body）。
 *
 * @remarks
 * 注：`role`/`email` 旧 DTO 仅 `@IsString()+@IsNotEmpty()`（**非 @IsEmail**·存在性/角色可派发性由
 * 门面在服务端查库 fail-closed 裁决），故此处只锁非空串，不校验邮箱格式、不判角色词表。
 *
 * @public
 */
export const updateMemberRoleSchema = strictObject({
  memberId: reqStringMax('validate.memberId.required', 128),
  role: reqStringMax('validate.role.required', 128),
});
export type UpdateMemberRole = z.infer<typeof updateMemberRoleSchema>;

/**
 * 移除租户成员入参。
 *
 * @public
 */
export const removeMemberSchema = strictObject({
  memberId: reqStringMax('validate.memberId.required', 128),
});
export type RemoveMember = z.infer<typeof removeMemberSchema>;

/**
 * 主动退出租户入参。
 *
 * @public
 */
export const leaveOrganizationSchema = strictObject({
  organizationId: reqStringMax('validate.organizationId.required', 128),
});
export type LeaveOrganization = z.infer<typeof leaveOrganizationSchema>;

/**
 * 创建租户邀请入参（email 仅锁非空+长度·格式交由服务端裁决）。
 *
 * @public
 */
export const createInvitationSchema = strictObject({
  email: reqStringMax('validate.email.required', 254),
  role: reqStringMax('validate.role.required', 128),
});
export type CreateInvitation = z.infer<typeof createInvitationSchema>;

/**
 * 邀请 id 入参（接受/撤回邀请用）。
 *
 * @public
 */
export const invitationIdSchema = strictObject({
  invitationId: reqStringMax('validate.invitationId.required', 128),
});
export type InvitationId = z.infer<typeof invitationIdSchema>;

/**
 * 设置活跃租户入参（写入会话上下文）。
 *
 * @public
 */
export const setActiveOrganizationSchema = strictObject({
  organizationId: reqStringMax('validate.organizationId.required', 128),
});
export type SetActiveOrganization = z.infer<typeof setActiveOrganizationSchema>;

/**
 * 设置会话活动租户入参（第三次层级复裁 切片 4·D7 租户激活解绑）：选租**不依赖先选活动组织**，
 * 令租成员在无活动 org 时亦可建立租上下文以达租级端点（计费/席位/目录）。服务端写前必校目标租户
 * 成员资格（防跨租提权）·契约仅收敛入参形状。
 *
 * @public
 */
export const setActiveTenantSchema = strictObject({
  tenantId: reqStringMax('validate.tenantId.required', 64),
});
export type SetActiveTenant = z.infer<typeof setActiveTenantSchema>;

/**
 * bind-existing 入参（module-org-odoo-company-mapping 切片 A·平台回填通道）：
 * 把**现存** Odoo 公司绑定到指定组织（存量/演示解堵·与 provisioning 自动建司互斥入口）。
 *
 * @remarks
 * `odooCompanyId` 为跨库弱引用（SaaS 库与 Odoo 库物理隔离·平行映射）——本契约不验公司在
 * Odoo 侧存在性，存在性核验归 handler（RPC 正向核验入切片 C 的 doctor 链）；
 * `odooCompanyName` 为平台侧手填快照（denormalize·不做实时跨库拼装）。
 *
 * @public
 */
export const bindOdooCompanySchema = strictObject({
  odooCompanyId: z.number({ error: 'validate.odooCompanyId.required' }).int().positive(),
  odooCompanyName: reqStringMax('validate.odooCompanyName.required', 256),
});
export type BindOdooCompany = z.infer<typeof bindOdooCompanySchema>;

/**
 * 租户路由参数（换轨 WP-C·approve/reject 的 `:id` 路径参·紧凑 input 平并单一对象）。
 * 旧 `@Param('id')` 无校验（命中即非空串）·`z.string()` 逐字保真。
 */
export const organizationIdParamSchema = strictObject({ id: z.string() });
export type OrganizationIdParam = z.infer<typeof organizationIdParamSchema>;

/** `POST /organizations/:id/odoo-binding` 合并入参（bind body ⊕ 路径 `id`·`.extend` 承 strict）。 */
export const bindOdooCompanyInputSchema = bindOdooCompanySchema.extend({ id: z.string() });
export type BindOdooCompanyInput = z.infer<typeof bindOdooCompanyInputSchema>;

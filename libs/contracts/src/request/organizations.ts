import type { z } from 'zod';
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

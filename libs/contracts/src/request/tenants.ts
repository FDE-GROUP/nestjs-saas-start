import type { z } from 'zod';
import { reqStringMax } from '../helpers';
import { strictObject } from '../strict';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** 申请创建租户入参（旧 `CreateTenantApplicationDto`·口径同 workspace）。 */
export const createTenantApplicationSchema = strictObject({
  name: reqStringMax('validate.name.required', 200),
  slug: reqStringMax('validate.slug.required', 128).regex(SLUG_PATTERN, {
    error: 'validate.slug.invalid',
  }),
});
export type CreateTenantApplication = z.infer<typeof createTenantApplicationSchema>;

/**
 * 租户成员/邀请门面入参（旧 `tenants-org.dto.ts` 六类·对齐 BA 内置端点 body）。
 * 注：`role`/`email` 旧 DTO 仅 `@IsString()+@IsNotEmpty()`（**非 @IsEmail**·存在性/角色可派发性由
 * 门面在服务端查库 fail-closed 裁决），故此处只锁非空串，不校验邮箱格式、不判角色词表。
 */
export const updateMemberRoleSchema = strictObject({
  memberId: reqStringMax('validate.memberId.required', 128),
  role: reqStringMax('validate.role.required', 128),
});
export type UpdateMemberRole = z.infer<typeof updateMemberRoleSchema>;

export const removeMemberSchema = strictObject({
  memberId: reqStringMax('validate.memberId.required', 128),
});
export type RemoveMember = z.infer<typeof removeMemberSchema>;

export const leaveTenantSchema = strictObject({
  organizationId: reqStringMax('validate.organizationId.required', 128),
});
export type LeaveTenant = z.infer<typeof leaveTenantSchema>;

export const createInvitationSchema = strictObject({
  email: reqStringMax('validate.email.required', 254),
  role: reqStringMax('validate.role.required', 128),
});
export type CreateInvitation = z.infer<typeof createInvitationSchema>;

export const invitationIdSchema = strictObject({
  invitationId: reqStringMax('validate.invitationId.required', 128),
});
export type InvitationId = z.infer<typeof invitationIdSchema>;

export const setActiveTenantSchema = strictObject({
  organizationId: reqStringMax('validate.organizationId.required', 128),
});
export type SetActiveTenant = z.infer<typeof setActiveTenantSchema>;

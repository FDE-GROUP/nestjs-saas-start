import { z } from 'zod';
import { reqStringMax } from '../helpers';
import { strictObject } from '../strict';

/**
 * 授权资源/动作词汇（**传输层 wire enum 单源**）。
 * ⚠ 领域/运行时值域 SSOT 在 `@core/saas-kit/authorization/tenant-rules`；contracts 保持零依赖
 * （前端可安全消费·不含领域内核），故此处内联同一字面量，并由 apps/api 的
 * `contracts-vocab-parity.test.ts` 对拍锁定「contracts wire 值域 === core 值域」——core 改值即时红，防漂移。
 */
export const TENANT_SUBJECT_VALUES = [
  'Organization',
  'Member',
  'Invitation',
  'Workspace',
  'Role',
  'RoleGrant',
] as const;
export const TENANT_ACTION_VALUES = ['create', 'read', 'update', 'delete', 'cancel'] as const;

/** 创建角色入参（旧 `CreateRoleDto`）。 */
export const createRoleSchema = strictObject({
  key: reqStringMax('validate.roleKey.required', 128),
  name: reqStringMax('validate.roleName.required', 200),
});
export type CreateRole = z.infer<typeof createRoleSchema>;

/** 重命名角色入参（旧 `RenameRoleDto`·形同 CreateRole）。 */
export const renameRoleSchema = strictObject({
  key: reqStringMax('validate.roleKey.required', 128),
  name: reqStringMax('validate.roleName.required', 200),
});
export type RenameRole = z.infer<typeof renameRoleSchema>;

/** 删除角色入参（旧 `DeleteRoleDto`）。 */
export const deleteRoleSchema = strictObject({
  key: reqStringMax('validate.roleKey.required', 128),
});
export type DeleteRole = z.infer<typeof deleteRoleSchema>;

/**
 * 授予/撤销角色权限入参（旧 `GrantRolePermissionDto` 与 `RevokeRolePermissionDto extends` 同形）。
 * `conditions` 旧 `@IsObject({message})`：present 非对象即回 key（服务端策略闸 `isValidGrantConditions` 判内容）。
 */
export const grantRolePermissionSchema = strictObject({
  roleKey: reqStringMax('validate.roleKey.required', 128),
  subject: z.enum(TENANT_SUBJECT_VALUES),
  action: z.enum(TENANT_ACTION_VALUES),
  conditions: z
    .record(z.string(), z.unknown(), { error: 'validate.grantConditions.object' })
    .optional(),
});
export type GrantRolePermission = z.infer<typeof grantRolePermissionSchema>;

/** 撤权入参（旧 `RevokeRolePermissionDto`·与授予同形，语义差异在服务端按 conditions 是否给精确撤单行）。 */
export const revokeRolePermissionSchema = grantRolePermissionSchema;
export type RevokeRolePermission = GrantRolePermission;

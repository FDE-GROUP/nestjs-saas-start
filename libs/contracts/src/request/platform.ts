import { z } from 'zod';
import { optStringMax } from '../helpers';
import { ORG_VISIBILITY_VALUES } from '../response/organizations';
import { strictObject } from '../strict';
import { pageShape } from './pagination';

/**
 * 跨租列表查询（治理台改锚 tenant·旧 `ListPlatformOrganizationsDto` → `ListPlatformTenantsDto` + search 模糊）。
 *
 * @public
 */
export const listPlatformTenantsQuerySchema = strictObject({
  ...pageShape,
  search: optStringMax(200),
});
export type ListPlatformTenantsQuery = z.infer<typeof listPlatformTenantsQuerySchema>;

/**
 * 跨平台用户列表查询（旧 `ListPlatformUsersDto extends ListPageDto` + search 模糊）。
 *
 * @public
 */
export const listPlatformUsersQuerySchema = strictObject({
  ...pageShape,
  search: optStringMax(200),
});
export type ListPlatformUsersQuery = z.infer<typeof listPlatformUsersQuerySchema>;

/**
 * 暂停用户可选理由（旧 `SuspendUserDto`·写入 `user.statusReason` 真列 + 审计上下文）。
 *
 * @public
 */
export const suspendUserSchema = strictObject({
  reason: z.string().max(500).optional(),
});
export type SuspendUser = z.infer<typeof suspendUserSchema>;

/**
 * 平台用户主键路径参（换轨 WP-C·旧 `@Param('id') id`·resume 无体路由的合并 input）。
 * @public
 */
export const platformUserIdParamSchema = strictObject({
  id: z.string(),
});
export type PlatformUserIdParam = z.infer<typeof platformUserIdParamSchema>;

/**
 * 暂停用户入参（换轨 WP-C·`suspendUserSchema` body ⊕ `:id` 路径参平并·PATCH 紧凑 input 结构）。
 * @public
 */
export const suspendUserInputSchema = suspendUserSchema.extend({
  id: z.string(),
});
export type SuspendUserInput = z.infer<typeof suspendUserInputSchema>;

/**
 * 设置租户租内跨组织可见性策略（第三次复裁切片 3·D2·`platform/organizations` 治理面 PATCH）。
 *
 * @remarks
 * 仅改 `tenant.orgVisibility`∈{shared,isolated}（跨租硬地板 `tenantId` 不受影响）；
 * `shared` 保持存量互见、`isolated` 使租内跨组织互不可见（经全局 filter 消费）。
 *
 * @public
 */
export const setTenantOrgVisibilitySchema = strictObject({
  orgVisibility: z.enum(ORG_VISIBILITY_VALUES),
});
export type SetTenantOrgVisibility = z.infer<typeof setTenantOrgVisibilitySchema>;

/**
 * 租户主键路径参（换轨 WP-C·旧 `@Param('tenantId')`·detail/suspend/resume/remove/permanent 无体或纯参路由）。
 * @public
 */
export const platformTenantIdParamSchema = strictObject({
  tenantId: z.string(),
});
export type PlatformTenantIdParam = z.infer<typeof platformTenantIdParamSchema>;

/**
 * 设置可见性入参（换轨 WP-C·`setTenantOrgVisibilitySchema` body ⊕ `:tenantId` 路径参平并）。
 * @public
 */
export const setTenantOrgVisibilityInputSchema = setTenantOrgVisibilitySchema.extend({
  tenantId: z.string(),
});
export type SetTenantOrgVisibilityInput = z.infer<typeof setTenantOrgVisibilityInputSchema>;

/**
 * 组织下钻双路径参（换轨 WP-C·旧 `@Param('tenantId') @Param('orgId')`·diagnostics/export GET）。
 * @remarks
 * `tenantId` 仅作路径锚（下钻经租户抵达）·handler 只消费 `orgId`（旧 `_tenantId` 口径不变）。
 * @public
 */
export const platformOrgDrilldownParamSchema = strictObject({
  tenantId: z.string(),
  orgId: z.string(),
});
export type PlatformOrgDrilldownParam = z.infer<typeof platformOrgDrilldownParamSchema>;

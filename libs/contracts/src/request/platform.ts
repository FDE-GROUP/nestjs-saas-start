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

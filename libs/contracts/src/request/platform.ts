import { z } from 'zod';
import { optStringMax } from '../helpers';
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

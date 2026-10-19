import { z } from 'zod';
import { strictObject } from '../strict';
import { pageShape } from './pagination';

/** 跨租户列表查询（旧 `ListPlatformTenantsDto extends ListPageDto` + search 模糊）。 */
export const listPlatformTenantsQuerySchema = strictObject({
  ...pageShape,
  search: z.string().optional(),
});
export type ListPlatformTenantsQuery = z.infer<typeof listPlatformTenantsQuerySchema>;

/** 跨平台用户列表查询（旧 `ListPlatformUsersDto extends ListPageDto` + search 模糊）。 */
export const listPlatformUsersQuerySchema = strictObject({
  ...pageShape,
  search: z.string().optional(),
});
export type ListPlatformUsersQuery = z.infer<typeof listPlatformUsersQuerySchema>;

/** 暂停用户可选理由（旧 `SuspendUserDto`·写入 user_status.reason + 审计上下文）。 */
export const suspendUserSchema = strictObject({
  reason: z.string().max(500).optional(),
});
export type SuspendUser = z.infer<typeof suspendUserSchema>;

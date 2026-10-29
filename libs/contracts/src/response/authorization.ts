import { z } from 'zod';
import {
  AUTHORIZATION_ACTION_VALUES,
  AUTHORIZATION_SUBJECT_VALUES,
} from '../request/authorization';

/**
 * 租户角色视图（S7b·真相源 = `AuthorizationAdminController` 返回类型·片二 K4 复原命名 `organization*→tenant*`）。
 *
 * @public
 */
export const tenantRoleViewSchema = z.object({
  id: z.string(),
  /** 角色 key（租户内唯一）。 */
  key: z.string(),
  /** 人面可读名。 */
  name: z.string(),
  /** 系统内置角色（不可改名/删除）。 */
  isSystem: z.boolean(),
});
export type TenantRoleView = z.infer<typeof tenantRoleViewSchema>;

/**
 * 角色授权项视图（subject × action 的授予记录）。
 *
 * @remarks
 * subject/action 词汇复用请求侧内联单源（apps 侧 vocab 对拍锁 vs `@core` CASL 值域）。
 *
 * @public
 */
export const tenantRoleGrantViewSchema = z.object({
  subject: z.enum(AUTHORIZATION_SUBJECT_VALUES),
  action: z.enum(AUTHORIZATION_ACTION_VALUES),
  /** CASL 条件（白名单字段）；null = 无约束。值面自由透传（strip 只作用于本层键）。 */
  conditions: z.record(z.string(), z.unknown()).nullable(),
});
export type TenantRoleGrantView = z.infer<typeof tenantRoleGrantViewSchema>;

/**
 * 角色列表出线（换轨 WP-C·旧 `@SerializeOptions` 逐元素数组面经 `.output` 显式包数组承接）。
 * @public
 */
export const tenantRoleViewListSchema = z.array(tenantRoleViewSchema);

/**
 * 授权行列表出线（换轨 WP-C·纪律同 {@link tenantRoleViewListSchema}）。
 * @public
 */
export const tenantRoleGrantViewListSchema = z.array(tenantRoleGrantViewSchema);

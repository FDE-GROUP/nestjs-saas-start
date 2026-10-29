/**
 * authorization-admin（角色/授权管理门面）procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 租户差异化授权唯一入口（module-rbac-dynamic-roles §2.5·`@Controller('organizations/roles')`）：
 * 角色 CRUD（list/create/rename/delete）+ 授权行（list/grant/revoke）。class 级双守卫 + 方法级 `@Can`
 * 留 apps/api（CASL 经 `AuthorizationGuard` 判定）。S4 `@Body({schema})` 校验与 S7b `@SerializeOptions`
 * 白名单下沉 procedure 级 `.input/.output`（数组逐元素面显式包 List schema）。void 端点（rename/delete/grant/revoke）
 * 无固定响应载荷→有意不挂 `.output`（逐字透传·宁缺不造·属 M5 豁免面·沿 `usersDelete` 空回执口径）。
 */
import {
  createRoleSchema,
  deleteRoleSchema,
  grantRolePermissionSchema,
  listGrantsQuerySchema,
  renameRoleSchema,
  revokeRolePermissionSchema,
  tenantRoleGrantViewListSchema,
  tenantRoleViewListSchema,
  tenantRoleViewSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const authzListRolesMeta = openapi({
  method: 'GET',
  path: '/organizations/roles',
  summary: 'List roles of the active organization (system + custom)',
});
export const authzCreateRoleMeta = openapi({
  method: 'POST',
  path: '/organizations/roles',
  summary: 'Create a custom role (owner/admin)',
});
export const authzRenameRoleMeta = openapi({
  method: 'POST',
  path: '/organizations/roles/rename',
  summary: 'Rename a custom role (system roles protected)',
});
export const authzDeleteRoleMeta = openapi({
  method: 'POST',
  path: '/organizations/roles/delete',
  summary: 'Delete a custom role (grants cascade; system roles protected)',
});
export const authzListGrantsMeta = openapi({
  method: 'GET',
  path: '/organizations/roles/grants',
  summary: 'List grant rows of a role (echo checked state)',
});
export const authzGrantMeta = openapi({
  method: 'POST',
  path: '/organizations/roles/grants',
  summary: 'Grant a permission cell to a role (multi-condition rows = OR union)',
});
export const authzRevokeMeta = openapi({
  method: 'POST',
  path: '/organizations/roles/grants/revoke',
  summary: 'Revoke a grant (conditions null = whole-subject row; object = exact row)',
});

export const authzListRolesContract = oc.output(tenantRoleViewListSchema).meta(authzListRolesMeta);
export const authzCreateRoleContract = oc
  .input(createRoleSchema)
  .output(tenantRoleViewSchema)
  .meta(authzCreateRoleMeta);
export const authzRenameRoleContract = oc.input(renameRoleSchema).meta(authzRenameRoleMeta);
export const authzDeleteRoleContract = oc.input(deleteRoleSchema).meta(authzDeleteRoleMeta);
export const authzListGrantsContract = oc
  .input(listGrantsQuerySchema)
  .output(tenantRoleGrantViewListSchema)
  .meta(authzListGrantsMeta);
export const authzGrantContract = oc.input(grantRolePermissionSchema).meta(authzGrantMeta);
export const authzRevokeContract = oc.input(revokeRolePermissionSchema).meta(authzRevokeMeta);

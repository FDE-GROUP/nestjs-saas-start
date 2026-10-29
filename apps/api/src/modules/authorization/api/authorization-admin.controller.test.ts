import 'reflect-metadata';
import { CAN_KEY, type CanRequirement } from '@core/saas-kit/authorization/can.decorator';
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
import { describe, expect, it } from 'vitest';
import {
  AuthorizationAdminController,
  authzCreateRoleContract,
  authzDeleteRoleContract,
  authzGrantContract,
  authzListGrantsContract,
  authzListRolesContract,
  authzRenameRoleContract,
  authzRevokeContract,
} from './authorization-admin.controller';

/**
 * 角色/授权管理门面元数据锁（module-rbac-dynamic-roles S3·§2.5）。
 * 两类锁：① 每端点 `@Can(action, subject)` 与 seed 授予的管理职权格一致（Role: create/read/
 * update/delete·RoleGrant: create=read 列表/delete=revoke）——声明错格即授权面漂移；
 * ② 换轨 WP-C 后校验/序列化落点由旧 `@Body({schema})` 参数元数据 + `@SerializeOptions` 类序列化
 * 换到 procedure 级 `.input/.output`（zod 单源不变）——本测锁 contract 携对应 schema，
 * 复刻旧防线本职（防漏配致校验/白名单整链静默跳过）。
 * 授权**裁决**（角色→allow/deny）由 CASL 守卫链锁测覆盖，本测只锁声明元数据。
 */

interface SchemasDef {
  inputSchemas?: readonly unknown[];
  outputSchemas?: readonly unknown[];
}

function schemasOf(contract: object): SchemasDef {
  return (contract as { '~orpc': SchemasDef })['~orpc'];
}

// `@Can` = `SetMetadata`：元数据挂在方法函数（descriptor.value）上，与 Reflector 读回同源。
// 换轨后方法体返回 procedure，但 `@Can` 仍落本方法·元数据源不变。
const proto = AuthorizationAdminController.prototype as unknown as Record<string, unknown>;
const can = (method: string): CanRequirement | undefined =>
  Reflect.getMetadata(CAN_KEY, proto[method] as object) as CanRequirement | undefined;

describe('AuthorizationAdminController @Can 声明元数据', () => {
  it('角色管理端点声明落 Role 职权格', () => {
    expect(can('listRoles')).toEqual({ action: 'read', subject: 'Role' });
    expect(can('createRole')).toEqual({ action: 'create', subject: 'Role' });
    expect(can('renameRole')).toEqual({ action: 'update', subject: 'Role' });
    expect(can('deleteRole')).toEqual({ action: 'delete', subject: 'Role' });
  });

  it('授权管理端点声明落 RoleGrant 职权格（read=列表·create=授权·delete=撤权）', () => {
    expect(can('listGrants')).toEqual({ action: 'read', subject: 'RoleGrant' });
    expect(can('grant')).toEqual({ action: 'create', subject: 'RoleGrant' });
    expect(can('revoke')).toEqual({ action: 'delete', subject: 'RoleGrant' });
  });
});

describe('AuthorizationAdminController contract 校验/序列化 parity（S4 input + S7b output）', () => {
  it('createRole contract：input=createRoleSchema·output=单对象 tenantRoleViewSchema', () => {
    const def = schemasOf(authzCreateRoleContract);
    expect(def.inputSchemas).toContain(createRoleSchema);
    expect(def.outputSchemas).toContain(tenantRoleViewSchema);
  });

  it('listRoles/listGrants 数组面：output 携显式包数组视图（旧逐元素 @SerializeOptions 承接）', () => {
    expect(schemasOf(authzListRolesContract).outputSchemas).toContain(tenantRoleViewListSchema);
    expect(schemasOf(authzListGrantsContract).outputSchemas).toContain(
      tenantRoleGrantViewListSchema,
    );
  });

  it('listGrants contract：input=listGrantsQuerySchema（roleKey 可选·缺参 handler 内抛 400）', () => {
    expect(schemasOf(authzListGrantsContract).inputSchemas).toContain(listGrantsQuerySchema);
  });

  it('renameRole/deleteRole contract：input 携真实 schema', () => {
    expect(schemasOf(authzRenameRoleContract).inputSchemas).toContain(renameRoleSchema);
    expect(schemasOf(authzDeleteRoleContract).inputSchemas).toContain(deleteRoleSchema);
  });

  it('grant/revoke contract：input 携真实授权 schema', () => {
    expect(schemasOf(authzGrantContract).inputSchemas).toContain(grantRolePermissionSchema);
    expect(schemasOf(authzRevokeContract).inputSchemas).toContain(revokeRolePermissionSchema);
  });

  it('void 端点（renameRole/deleteRole/grant/revoke）不挂 output（无载荷·透传）', () => {
    for (const contract of [
      authzRenameRoleContract,
      authzDeleteRoleContract,
      authzGrantContract,
      authzRevokeContract,
    ]) {
      expect(schemasOf(contract).outputSchemas ?? []).toEqual([]);
    }
  });
});

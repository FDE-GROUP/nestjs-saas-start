import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { BadRequestException, Controller, Inject, UseGuards } from '@nestjs/common';
import { Impl } from '@orpc/nest';
import {
  authzCreateRoleContract,
  authzCreateRoleMeta,
  authzDeleteRoleContract,
  authzDeleteRoleMeta,
  authzGrantContract,
  authzGrantMeta,
  authzListGrantsContract,
  authzListGrantsMeta,
  authzListRolesContract,
  authzListRolesMeta,
  authzRenameRoleContract,
  authzRenameRoleMeta,
  authzRevokeContract,
  authzRevokeMeta,
} from '@saas/api-contract/index';
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
import { os } from '../../../common/orpc/orpc';
import { TenantRbacAdminService } from '../application/organization-rbac-admin.service';

/**
 * 角色/授权**管理门面**端点（module-rbac-dynamic-roles §2.5·S3·甲裁自建角色 + 丁裁随片授权面）。
 *
 * @remarks
 * 授权在我·数据在 DB：每端点声明 `@Can(<动作>, 'Role'|'RoleGrant')`，由 `AuthorizationGuard`
 * 携 ALS 角色经 CASL（规则源 = 本租户 DB grant 行）裁决；通过后委派 `TenantRbacAdminService`
 * 落库（写侧过 domain 策略闸 + 同通道审计行 + 写后失效投影缓存）。BA 内置 create-role/roles 端点
 * 维持封堵（甲裁不代建→本片自建），本门面是租户差异化授权策略的唯一入口。
 *
 * `@Can` 落点与 seed 一致：owner/admin 持 `Role`(create/read/update/delete) + `RoleGrant`
 * (create/read/delete)，member 无 → 非管理员请求由守卫 403（fail-closed）。
 * @public
 */
// 换轨 WP-C：七路由转 per-method `@Impl`（非 router 扇出）——class 级 `@UseGuards(TenantIsolationGuard,
// AuthorizationGuard)` + 方法级 `@Can` 原生保留（守卫墙不弱化）。旧 S4 `@Body({schema})` 参数校验与
// S7b `@SerializeOptions` 序列化白名单换落点到 procedure 级 `.input/.output`（zod 单源不变·数组逐元素
// 面显式包 `tenantRoleViewListSchema`/`tenantRoleGrantViewListSchema`）；void 端点不挂 `.output`。
// listGrants 缺参的 `BadRequestException` 经 WP-D 错误面逐字承接为 REST 400 信封。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export {
  authzCreateRoleContract,
  authzDeleteRoleContract,
  authzGrantContract,
  authzListGrantsContract,
  authzListRolesContract,
  authzRenameRoleContract,
  authzRevokeContract,
};

@Controller('')
@UseGuards(TenantIsolationGuard, AuthorizationGuard)
export class AuthorizationAdminController {
  constructor(@Inject(TenantRbacAdminService) private readonly rbac: TenantRbacAdminService) {}

  /**
   * 列出活动租户全部角色（系统 + 自定义）。
   * @returns 角色读模型列表。
   */
  @Can('read', 'Role')
  @Impl(authzListRolesContract)
  listRoles() {
    return os
      .output(tenantRoleViewListSchema)
      .meta(authzListRolesMeta)
      .handler(() => this.rbac.listRoles());
  }

  /**
   * 创建自定义角色（仅 owner/admin）。
   * @returns 创建后的角色读模型（无效/保留 key→400·重复 key→409·经 WP-D 承接）。
   */
  @Can('create', 'Role')
  @Impl(authzCreateRoleContract)
  createRole() {
    return os
      .input(createRoleSchema)
      .output(tenantRoleViewSchema)
      .meta(authzCreateRoleMeta)
      .handler(({ input }) => this.rbac.createRole(input.key, input.name));
  }

  /**
   * 自定义角色改名（系统角色屏·未命中 404/系统角色 409 经 WP-D 承接）。
   */
  @Can('update', 'Role')
  @Impl(authzRenameRoleContract)
  renameRole() {
    return os
      .input(renameRoleSchema)
      .meta(authzRenameRoleMeta)
      .handler(async ({ input }) => {
        await this.rbac.renameRole(input.key, input.name);
      });
  }

  /**
   * 删除自定义角色（授权行级联销·系统角色屏·未命中 404/系统角色 409 经 WP-D 承接）。
   */
  @Can('delete', 'Role')
  @Impl(authzDeleteRoleContract)
  deleteRole() {
    return os
      .input(deleteRoleSchema)
      .meta(authzDeleteRoleMeta)
      .handler(async ({ input }) => {
        await this.rbac.deleteRole(input.key);
      });
  }

  /**
   * 列出某角色的授权行（回显勾选态·缺 roleKey 查询参数 → 400 经 WP-D 承接）。
   */
  @Can('read', 'RoleGrant')
  @Impl(authzListGrantsContract)
  listGrants() {
    return os
      .input(listGrantsQuerySchema)
      .output(tenantRoleGrantViewListSchema)
      .meta(authzListGrantsMeta)
      .handler(async ({ input }) => {
        if (!input.roleKey) {
          throw new BadRequestException('roleKey query param is required');
        }
        return this.rbac.getGrants(input.roleKey);
      });
  }

  /**
   * 为角色新增授权格（同格多条件行 = OR 并集·无效条件 400/未命中 404/重复 409 经 WP-D 承接）。
   */
  @Can('create', 'RoleGrant')
  @Impl(authzGrantContract)
  grant() {
    return os
      .input(grantRolePermissionSchema)
      .meta(authzGrantMeta)
      .handler(async ({ input }) => {
        await this.rbac.grant(input.roleKey, {
          subject: input.subject,
          action: input.action,
          conditions: input.conditions ?? null,
        });
      });
  }

  /**
   * 撤权（conditions 缺省 = 整 subject 级行；传对象 = 精确撤单条件行·未命中 404 经 WP-D 承接）。
   */
  @Can('delete', 'RoleGrant')
  @Impl(authzRevokeContract)
  revoke() {
    return os
      .input(revokeRolePermissionSchema)
      .meta(authzRevokeMeta)
      .handler(async ({ input }) => {
        await this.rbac.revoke(
          input.roleKey,
          input.subject,
          input.action,
          input.conditions ?? null,
        );
      });
  }
}

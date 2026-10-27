import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import {
  PERMISSION_CHECKER,
  PERMISSION_INVALIDATOR,
} from '@core/saas-kit/authorization/permission.port';
import { Global, Module } from '@nestjs/common';
import { AuthorizationAdminController } from './api/authorization-admin.controller';
import { TenantRbacAdminService } from './application/organization-rbac-admin.service';
import { ROLE_ASSIGNABILITY_READER } from './domain/ports/role-assignability.port';
import { TENANT_INVITATION_MANAGER } from './domain/ports/tenant-invitation.port';
import { TENANT_MEMBERSHIP_MANAGER } from './domain/ports/tenant-membership.port';
import { TENANT_RBAC_REPOSITORY } from './domain/repositories/organization-rbac.repository';
import { CaslPermissionChecker } from './infrastructure/casl-permission.checker';
import { MikroTenantRbacRepository } from './infrastructure/repositories/mikro-organization-rbac.repository';
import { MikroTenantInvitationManager } from './infrastructure/repositories/mikro-tenant-invitation.repository';
import { MikroTenantMembershipManager } from './infrastructure/repositories/mikro-tenant-membership.repository';

/**
 * Authorization 限界上下文（领域细化重构 A3·module-rbac-dynamic-roles 的上下文归位）。
 *
 * 收拢此前散在 5 处的授权事实与裁决机制（tenants 域件 / tenancy 边界层 / core rbac）：
 *  - 授权事实 SSOT 通道：`TENANT_RBAC_REPOSITORY`（MikroORM 唯一实现·tenant_role* 三表属主）；
 *  - 裁决机制：`CaslPermissionChecker` 单实例经 `useExisting` 兼读侧 checker 与写侧
 *    invalidator（端口契约在 core `authorization/`）；
 *  - 管理门面：`AuthorizationAdminController`（路由 `tenants/roles` 不变·对外契约不破）+
 *    `TenantRbacAdminService`（写侧过闸 + 审计 + 写后失效投影）；
 *  - published port：`ROLE_ASSIGNABILITY_READER` 供 tenants 成员/邀请门面消费（A5 接缝）。
 *
 * `@Global`：`AuthorizationGuard` 与裁决/失效端口是各业务上下文逐路由 `@Can` 的解析源
 * （此前由 TenantIsolationModule 全局供给，现迁至本上下文——横切隔离层只消费本模块投影，不再自住 checker）。
 * guard 依赖的 `TenantIsolationService` 由 @Global TenantIsolationModule 供给；模块图无环（本模块零 import）。
 */
@Global()
@Module({
  controllers: [AuthorizationAdminController],
  providers: [
    { provide: TENANT_RBAC_REPOSITORY, useClass: MikroTenantRbacRepository },
    TenantRbacAdminService,
    CaslPermissionChecker,
    AuthorizationGuard,
    { provide: PERMISSION_CHECKER, useExisting: CaslPermissionChecker },
    { provide: PERMISSION_INVALIDATOR, useExisting: CaslPermissionChecker },
    { provide: ROLE_ASSIGNABILITY_READER, useExisting: TenantRbacAdminService },
    // X7 切片 D：租级成员/角色分配、租级邀请自有 SSOT 的读写适配器（三表属 authorization·写侧合规）。
    // 以 symbol token 注册·经 @Global 导出供 organizations 租级成员/邀请门面（published port 相遇·
    // 沿 ROLE_ASSIGNABILITY_READER 同构·上下文间不直 import infrastructure）。
    { provide: TENANT_MEMBERSHIP_MANAGER, useClass: MikroTenantMembershipManager },
    { provide: TENANT_INVITATION_MANAGER, useClass: MikroTenantInvitationManager },
  ],
  exports: [
    AuthorizationGuard,
    PERMISSION_CHECKER,
    PERMISSION_INVALIDATOR,
    TENANT_RBAC_REPOSITORY,
    ROLE_ASSIGNABILITY_READER,
    TENANT_MEMBERSHIP_MANAGER,
    TENANT_INVITATION_MANAGER,
  ],
})
export class AuthorizationModule {}

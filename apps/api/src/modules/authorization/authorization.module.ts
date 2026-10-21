import { TenantPermissionGuard } from '@core/saas-kit/authorization/tenant-permission.guard';
import {
  TENANT_PERMISSION_CHECKER,
  TENANT_PERMISSION_INVALIDATOR,
} from '@core/saas-kit/authorization/tenant-permission.port';
import { Global, Module } from '@nestjs/common';
import { AuthorizationAdminController } from './api/authorization-admin.controller';
import { TenantRbacAdminService } from './application/tenant-rbac-admin.service';
import { ROLE_ASSIGNABILITY_READER } from './domain/ports/role-assignability.port';
import { TENANT_RBAC_REPOSITORY } from './domain/repositories/tenant-rbac.repository';
import { CaslTenantPermissionChecker } from './infrastructure/casl-tenant-permission.checker';
import { MikroTenantRbacRepository } from './infrastructure/repositories/mikro-tenant-rbac.repository';

/**
 * Authorization 限界上下文（领域细化重构 A3·module-rbac-dynamic-roles 的上下文归位）。
 *
 * 收拢此前散在 5 处的授权事实与裁决机制（tenants 域件 / tenancy 边界层 / core rbac）：
 *  - 授权事实 SSOT 通道：`TENANT_RBAC_REPOSITORY`（MikroORM 唯一实现·tenant_role* 三表属主）；
 *  - 裁决机制：`CaslTenantPermissionChecker` 单实例经 `useExisting` 兼读侧 checker 与写侧
 *    invalidator（端口契约在 core `authorization/`）；
 *  - 管理门面：`AuthorizationAdminController`（路由 `tenants/roles` 不变·对外契约不破）+
 *    `TenantRbacAdminService`（写侧过闸 + 审计 + 写后失效投影）；
 *  - published port：`ROLE_ASSIGNABILITY_READER` 供 tenants 成员/邀请门面消费（A5 接缝）。
 *
 * `@Global`：`TenantPermissionGuard` 与裁决/失效端口是各业务上下文逐路由 `@Can` 的解析源
 * （此前由 TenancyModule 全局供给，现迁至本上下文——横切隔离层只消费本模块投影，不再自住 checker）。
 * guard 依赖的 `TenantContextService` 由 @Global TenancyModule 供给；模块图无环（本模块零 import）。
 */
@Global()
@Module({
  controllers: [AuthorizationAdminController],
  providers: [
    { provide: TENANT_RBAC_REPOSITORY, useClass: MikroTenantRbacRepository },
    TenantRbacAdminService,
    CaslTenantPermissionChecker,
    TenantPermissionGuard,
    { provide: TENANT_PERMISSION_CHECKER, useExisting: CaslTenantPermissionChecker },
    { provide: TENANT_PERMISSION_INVALIDATOR, useExisting: CaslTenantPermissionChecker },
    { provide: ROLE_ASSIGNABILITY_READER, useExisting: TenantRbacAdminService },
  ],
  exports: [
    TenantPermissionGuard,
    TENANT_PERMISSION_CHECKER,
    TENANT_PERMISSION_INVALIDATOR,
    TENANT_RBAC_REPOSITORY,
    ROLE_ASSIGNABILITY_READER,
  ],
})
export class AuthorizationModule {}

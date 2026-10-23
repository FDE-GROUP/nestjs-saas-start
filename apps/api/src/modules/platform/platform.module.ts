import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { PLATFORM_SETTINGS } from '@core/saas-kit/platform/platform-config.port';
import { PLATFORM_IDENTITY_LOOKUP } from '@core/saas-kit/platform/platform-identity.port';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PlatformOrganizationsController } from './api/platform-organizations.controller';
import { PlatformUsersController } from './api/platform-users.controller';
import { ConfigPlatformSettings } from './infrastructure/config-platform.settings';
import { MikroPlatformIdentityLookup } from './infrastructure/mikro-platform-identity.lookup';

/**
 * Platform 平台治理限界上下文（领域细化重构 D 片）。
 *
 * 收拢此前散在 3 处的平台治理事实（core `tenancy/platform` 契约 / tenancy 边界层适配 /
 * tenants 的 `platform-*` HTTP 门面）：平台经营者执行的**跨租户治理门面**——
 * operator 闸门（PlatformOperatorGuard·FR-13 现裁：email 命中 config 硬判·判定语义不动）、
 * 平台审计单点（PlatformAuditService）、平台身份/配置端口适配。
 *
 * 边界纪律（防治理门面吃空核心域）：
 *  - **无自有表**（写能力留 tenants：approve/reject/suspend/diagnostics/export 等命令/查询
 *    handlers 与读模型不随门面搬入·controller 经 CQRS Bus 委派·未决项 3 裁「留 tenants」）；
 *  - **不自持角色模型**（平台层裁决概念归 authorization 平台 scope·实现维持 guard 现状）；
 *  - guard 依赖的 `UserStatusService`/`SESSION_READER` 由 @Global TenantIsolationModule 供给（模块图无环）。
 *
 * `@Global` 导出 guard/audit/端口：tenants 治理 handlers 跨模块注入审计单点（此前由
 * TenantIsolationModule 供给·现归本上下文）。
 */
@Global()
@Module({
  imports: [CqrsModule],
  controllers: [PlatformOrganizationsController, PlatformUsersController],
  providers: [
    PlatformOperatorGuard,
    PlatformAuditService,
    { provide: PLATFORM_IDENTITY_LOOKUP, useClass: MikroPlatformIdentityLookup },
    { provide: PLATFORM_SETTINGS, useClass: ConfigPlatformSettings },
  ],
  exports: [
    PlatformOperatorGuard,
    PlatformAuditService,
    PLATFORM_IDENTITY_LOOKUP,
    PLATFORM_SETTINGS,
  ],
})
export class PlatformModule {}

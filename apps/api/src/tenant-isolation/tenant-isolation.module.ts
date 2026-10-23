import { SESSION_READER } from '@core/saas-kit/tenant-isolation/session/request-session.port';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { TenantIsolationMiddleware } from '@core/saas-kit/tenant-isolation/tenant-isolation.middleware';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthSessionReader } from './infrastructure/auth-session.reader';

/**
 * Multi-tenancy能力模块（global-tenancy S0/S1/S2/S3/S4 · 混合复用骨架）。
 * Exposes `TenantIsolationService` globally, binds the per-request tenant scope via
 * `TenantIsolationMiddleware` (AsyncLocalStorage), and provides per-route guards:
 * - `TenantIsolationGuard` (S2 · FR-5): fail-closed gate requiring an active tenant.
 * Row-level filtering is enforced in each aggregate's repository adapter (single
 * choke-point, 禁散点).
 *
 * 机制层提纯（未决项 4·module-tenancy-lifecycle-quota-relocation）：deny-list 状态机
 * （`OrganizationStatusService`/`UserStatusService` + `TENANT/USER_STATUS_STORE` 适配）已归位
 * `OrganizationsModule`（租户治理域策略），席位配额（`QuotaService`/`QuotaGuard` + `QUOTA_STORE`）
 * 已归位 `SubscriptionsModule`（订阅域策略·FR-7）——两模块沿 Authorization/Platform 先例升 @Global
 * 保持原可见性语义（本模块 `TenantIsolationMiddleware` 的 deny-list 消费与 auth/platform 注入面零行为变更）。
 *
 * S11 · 高危#4 复合全局：`TenantIsolationGuard` 已升为全局 `APP_GUARD`（deny-by-default 租户墙），
 * 经 `AppModule` 中 `AuthModule`（会话墙）先于本模块解析 → 会话 401 先于租户 403。`@Public`/`@TenantIsolationExempt`
 * 显式旁路（见 `tenant-isolation.guard`）。`TenantPermissionGuard`/`PlatformOperatorGuard`/`QuotaGuard`
 * 仍逐路由 opt-in（语义异质·不宜全局）。
 *
 * 领域细化重构 A3：租户 RBAC 裁决（`TenantPermissionGuard` + CASL checker 与
 * `TENANT_PERMISSION_CHECKER`/`TENANT_PERMISSION_INVALIDATOR` 端口绑定）已迁出本横切
 * 隔离层，归 `AuthorizationModule`（@Global 供给）；领域细化重构 D：平台治理
 * （`PlatformOperatorGuard`/`PlatformAuditService` + `PLATFORM_IDENTITY_LOOKUP`/`PLATFORM_SETTINGS`
 * 适配）亦迁出，归 `PlatformModule`（@Global 供给）——本模块只留隔离机制与会话适配，
 * 不再依赖 OrganizationsModule。
 *
 * 命名纪律（global-domain-context-refactor 未决项 6·不改名裁定）：本目录定名 `tenancy/`
 * （业界机制名，如 nestjs-tenancy），不改 `multi-tenancy/`——`tenant`=业务概念 / `tenancy`=隔离机制
 * 的词义区分已由宪法「限界上下文地图与多租户机制层」节（`docs/specs/architecture.md` ±zh）术语纪律
 * 条款消解；物理改名反与内部 `TenantIsolationScope`/`TenantIsolationGuard` 等 tenant* 词汇打架，且触高危 #3 全仓
 * churn。机制层提纯（lifecycle/quota 归位·未决项 4）已由 module-tenancy-lifecycle-quota-relocation
 * 落地，本处仅立指针不复述宪法细节。
 */
@Global()
@Module({
  providers: [
    TenantIsolationService,
    TenantIsolationGuard,
    // §9.5.4①B · P1b 会话端口倒置：core 经端口消费会话/RBAC，Better Auth 实例适配由参考应用装配。
    { provide: SESSION_READER, useClass: AuthSessionReader },
    // S11 · 高危#4 复合全局：全局租户墙（deny-by-default）。TenantIsolationGuard 已在本模块 provide，
    // 其依赖（TenantIsolationService 本地 · Reflector 由 Nest core 自动提供）均可解析；useExisting 复用同实例。
    // @Public/@TenantIsolationExempt 路由经 Reflector 旁路。注册于 AuthModule 会话墙之后（AppModule import 顺序）。
    { provide: APP_GUARD, useExisting: TenantIsolationGuard },
  ],
  exports: [
    TenantIsolationService,
    TenantIsolationGuard,
    // 端口 token 随 @Global 一并导出：守卫/服务在消费模块（如 OrganizationsModule）就地实例化时
    // 也能解析到应用侧会话适配（对齐原 `原数据库服务` 经 @Global DatabaseModule 全局可见）。
    SESSION_READER,
  ],
})
export class TenantIsolationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantIsolationMiddleware).forRoutes('*');
  }
}

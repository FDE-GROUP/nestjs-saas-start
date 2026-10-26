import { ORGANIZATION_ODOO_BINDING_READER } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import { ORGANIZATION_ODOO_BINDING_WRITER } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-writer';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { ORGANIZATION_STATUS_STORE } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.store';
import { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import { USER_STATUS_STORE } from '@core/saas-kit/modules/organizations/lifecycle/user-status.store';
import { AUDIT_LOG_STORE } from '@core/saas-kit/shared-kernel/audit/audit-log.store';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { OrganizationsController } from './api/organizations.controller';
import { OrganizationsOrgAdminController } from './api/organizations-org-admin.controller';
import { OrganizationsSelfController } from './api/organizations-self.controller';
import { ApproveOrganizationCommandHandler } from './application/commands/handlers/approve-organization.command-handler';
import { BindOrganizationOdooCompanyCommandHandler } from './application/commands/handlers/bind-organization-odoo-company.command-handler';
import { DeleteOrganizationCommandHandler } from './application/commands/handlers/delete-organization.command-handler';
import { DeleteOrganizationPermanentlyCommandHandler } from './application/commands/handlers/delete-organization-permanently.command-handler';
import { RejectOrganizationCommandHandler } from './application/commands/handlers/reject-organization.command-handler';
import { ResumeOrganizationCommandHandler } from './application/commands/handlers/resume-organization.command-handler';
import { ResumeUserCommandHandler } from './application/commands/handlers/resume-user.command-handler';
import { SubmitOrganizationApplicationCommandHandler } from './application/commands/handlers/submit-organization-application.command-handler';
import { SuspendOrganizationCommandHandler } from './application/commands/handlers/suspend-organization.command-handler';
import { SuspendUserCommandHandler } from './application/commands/handlers/suspend-user.command-handler';
import { ExportOrganizationDataQueryHandler } from './application/queries/handlers/export-organization-data.query-handler';
import { GetOrganizationDiagnosticsQueryHandler } from './application/queries/handlers/get-organization-diagnostics.query-handler';
import { GetPlatformOrganizationQueryHandler } from './application/queries/handlers/get-platform-organization.query-handler';
import { ListPlatformOrganizationsQueryHandler } from './application/queries/handlers/list-platform-organizations.query-handler';
import { ListPlatformUsersQueryHandler } from './application/queries/handlers/list-platform-users.query-handler';
import { ORGANIZATION_GOVERNANCE_REPOSITORY } from './domain/repositories/organization-governance.repository';
import { ORGANIZATION_PROVISIONING_REPOSITORY } from './domain/repositories/organization-provisioning.repository';
import { USER_GOVERNANCE_REPOSITORY } from './domain/repositories/user-governance.repository';
import { MikroAuditLogStore } from './infrastructure/mikro-audit-log.store';
import { MikroOrganizationStatusStore } from './infrastructure/mikro-organization-status.store';
import { MikroUserStatusStore } from './infrastructure/mikro-user-status.store';
import { MikroOrganizationGovernanceRepository } from './infrastructure/repositories/mikro-organization-governance.repository';
import { MikroOrganizationProvisioningRepository } from './infrastructure/repositories/mikro-organization-provisioning.repository';
import { MikroUserGovernanceRepository } from './infrastructure/repositories/mikro-user-governance.repository';

const CommandHandlers = [
  SubmitOrganizationApplicationCommandHandler,
  ApproveOrganizationCommandHandler,
  RejectOrganizationCommandHandler,
  SuspendOrganizationCommandHandler,
  ResumeOrganizationCommandHandler,
  DeleteOrganizationCommandHandler,
  DeleteOrganizationPermanentlyCommandHandler,
  // module-org-odoo-company-mapping 切片 A：bind-existing 回填（平台级·治理审计单点）。
  BindOrganizationOdooCompanyCommandHandler,
  SuspendUserCommandHandler,
  ResumeUserCommandHandler,
];

const QueryHandlers = [
  ListPlatformOrganizationsQueryHandler,
  GetPlatformOrganizationQueryHandler,
  GetOrganizationDiagnosticsQueryHandler,
  ExportOrganizationDataQueryHandler,
  ListPlatformUsersQueryHandler,
];

/**
 * Organization lifecycle slice (global-tenancy S4 · FR-1/FR-11/FR-12). `AuthInstanceInjectKey`
 * (global via AuthModule.forRoot) and `原数据库服务` (DatabaseModule @Global) are
 * resolved without extra imports.
 *
 * 机制层提纯（未决项 4·module-tenancy-lifecycle-quota-relocation）：deny-list 状态机
 * （`OrganizationStatusService`/`UserStatusService` + 两 store 的 Mikro 适配）由 TenantIsolationModule 归位
 * 本上下文（租户/用户状态机是租户治理域策略·借用机制的域策略还家）；沿 Authorization/Platform
 * 先例升 `@Global` 保持原可见性语义（tenancy 中间件 deny-list 消费、auth 会话墙/platform 闸门注入零行为变更）。
 */
@Global()
@Module({
  imports: [CqrsModule],
  // module-rbac-casl 甲裁：BA 内置 org 授权 HTTP 面封堵后，成员/邀请管理门面（@Can·CASL）
  // 与个人通道门面（TenantIsolationExempt·BA 数据面自裁决）接管对外端点。
  controllers: [
    OrganizationsController,
    OrganizationsOrgAdminController,
    OrganizationsSelfController,
  ],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Dependency inversion: domain owns the gateway port, infrastructure calls Better Auth.
    // ORM 修宪案 B · 切片 3d（S-d2）：provisioning gateway 改指 MikroOrganizationProvisioningRepository
    // （MikroORM 为唯一实现；`submit` 仍走 BA
    // createOrganization 系统动作·仅 `remove` 落 Mikro nativeDelete）。
    {
      provide: ORGANIZATION_PROVISIONING_REPOSITORY,
      useClass: MikroOrganizationProvisioningRepository,
    },
    // S5 governance: platform-level cross-tenant read model (no tenant filter).
    // ORM 修宪案 B · 切片 3c-ii-B：治理读面整片切 Mikro（MikroORM 为唯一实现）。
    {
      provide: ORGANIZATION_GOVERNANCE_REPOSITORY,
      useClass: MikroOrganizationGovernanceRepository,
    },
    // 切片 B published port：features/odoo-rpc-api 经 @core 端口读绑定（双向隔离不破·
    // 沿 AUDIT_LOG_STORE 同法 @Global 导出供跨上下文解析）。
    // useExisting 指向同一治理仓储实例（类仅以 symbol token 注册·无类 token provider）：
    // MikroOrganizationGovernanceRepository 同时实现 reader 的 `read()`，别名即复用同一体。
    { provide: ORGANIZATION_ODOO_BINDING_READER, useExisting: ORGANIZATION_GOVERNANCE_REPOSITORY },
    // 切片 C published port：features/odoo-provisioning 经 @core 端口推进绑定态（先落意图→ready/failed）。
    // 同一体（MikroOrganizationGovernanceRepository 兼实现 writer 三面）·@Global 导出供跨上下文解析。
    { provide: ORGANIZATION_ODOO_BINDING_WRITER, useExisting: ORGANIZATION_GOVERNANCE_REPOSITORY },
    // S6 user governance: platform-level cross-user read model (no tenant filter)。
    { provide: USER_GOVERNANCE_REPOSITORY, useClass: MikroUserGovernanceRepository },
    // 机制层提纯（未决项 4）：lifecycle 服务与 store 适配自 TenantIsolationModule 归位本上下文。
    // §9.5.4①B 端口倒置：core 服务经端口消费持久化，适配由本（参考）应用装配。
    OrganizationStatusService,
    UserStatusService,
    { provide: ORGANIZATION_STATUS_STORE, useClass: MikroOrganizationStatusStore },
    { provide: USER_STATUS_STORE, useClass: MikroUserStatusStore },
    // global-governance-lifecycle-consolidation 切片 E：治理审计耐久账本适配（唯一写面·属主 tenants）。
    //  core `PlatformAuditService`（PlatformModule @Global）经本端口消费·@Global 保跨模块可见。
    { provide: AUDIT_LOG_STORE, useClass: MikroAuditLogStore },
    // 领域细化重构 A3：RBAC 仓储绑定与 OrganizationRbacAdminService 已迁 AuthorizationModule
    // （tenants 经全局 ROLE_ASSIGNABILITY_READER published port 消费角色可挂载判定）。
    // 领域细化重构 D：platform-* 治理 HTTP 门面已迁 PlatformModule（经 CQRS Bus 调本上下文
    // handlers·闸门/审计单点由 PlatformModule @Global 供给）；命令/查询 handlers 与读模型
    // 留 tenants（租户生命周期写能力是核心域本体）。
  ],
  exports: [
    // 随 @Global 导出：跨上下文消费面（tenancy 中间件 deny-list·auth 会话墙·platform 闸门）保形。
    OrganizationStatusService,
    UserStatusService,
    ORGANIZATION_STATUS_STORE,
    USER_STATUS_STORE,
    AUDIT_LOG_STORE,
    ORGANIZATION_ODOO_BINDING_READER,
    ORGANIZATION_ODOO_BINDING_WRITER,
  ],
})
export class OrganizationsModule {}

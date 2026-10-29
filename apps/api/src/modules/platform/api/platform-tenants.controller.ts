import { DeleteOrganizationCommand } from '@app/modules/organizations/application/commands/delete-organization.command';
import { DeleteOrganizationPermanentlyCommand } from '@app/modules/organizations/application/commands/delete-organization-permanently.command';
import { ResumeOrganizationCommand } from '@app/modules/organizations/application/commands/resume-organization.command';
import { SetTenantOrgVisibilityCommand } from '@app/modules/organizations/application/commands/set-tenant-org-visibility.command';
import { SuspendOrganizationCommand } from '@app/modules/organizations/application/commands/suspend-organization.command';
import { ExportOrganizationDataQuery } from '@app/modules/organizations/application/queries/export-organization-data.query';
import { GetOrganizationDiagnosticsQuery } from '@app/modules/organizations/application/queries/get-organization-diagnostics.query';
import { GetPlatformTenantQuery } from '@app/modules/organizations/application/queries/get-platform-tenant.query';
import { ListPlatformTenantsQuery } from '@app/modules/organizations/application/queries/list-platform-tenants.query';
import type { OrganizationDataExport } from '@app/modules/organizations/application/read-models/organization-data-export.read-model';
import type {
  OrganizationDiagnostics,
  PlatformTenantDetail,
  PlatformTenantPage,
} from '@app/modules/organizations/application/read-models/platform-tenant.read-model';
import type {
  TenantGovernanceResult,
  TenantHardDeleteResult,
  TenantOrgVisibilityResult,
} from '@app/modules/organizations/application/read-models/tenant-governance.read-model';
import type { OrgVisibility } from '@core/saas-kit/modules/organizations/visibility/org-visibility';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import { Controller, Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Impl } from '@orpc/nest';
import {
  platformTenantsDetailContract,
  platformTenantsDetailMeta,
  platformTenantsDiagnosticsContract,
  platformTenantsDiagnosticsMeta,
  platformTenantsExportContract,
  platformTenantsExportMeta,
  platformTenantsListContract,
  platformTenantsListMeta,
  platformTenantsPermanentRemoveContract,
  platformTenantsPermanentRemoveMeta,
  platformTenantsRemoveContract,
  platformTenantsRemoveMeta,
  platformTenantsResumeContract,
  platformTenantsResumeMeta,
  platformTenantsSuspendContract,
  platformTenantsSuspendMeta,
  platformTenantsVisibilityContract,
  platformTenantsVisibilityMeta,
} from '@saas/api-contract/index';
import {
  listPlatformTenantsQuerySchema,
  organizationDataExportViewSchema,
  organizationDiagnosticsSchema,
  platformOrgDrilldownParamSchema,
  platformTenantDetailSchema,
  platformTenantIdParamSchema,
  platformTenantPageSchema,
  setTenantOrgVisibilityInputSchema,
  tenantGovernanceResultSchema,
  tenantHardDeleteResultSchema,
  tenantOrgVisibilityResultSchema,
} from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';
import { requireSessionUser } from '../../../common/orpc/orpc-context';

/**
 * 平台操作员治理切片的 HTTP 控制器（多租户 S5 · FR-6/FR-11①/FR-13）。
 *
 * @remarks
 * Platform operator governance slice (global-tenancy S5 · FR-6/FR-11①/FR-13).
 *
 * Every route is gated by `PlatformOperatorGuard` (the sole cross-tenant authority —
 * the unique platform operator, DB email matches `platform.operatorEmail`, fail-closed).
 * These handlers read/write WITHOUT a tenant scope on purpose: platform-level governance
 * spans all tenants (FR-11①), so they deliberately never bind TenantIsolationGuard.
 *
 * rehierarchy 片一（治理台改锚 tenant·准入态归位）：治理台全线以 **tenant 主键**为锚——审批准入态权威单点住
 * `tenant.status`，经 `TenantStatusService.transition(tenantId, …)`（§9.4 迁移表）裁决 suspend（active→suspended）、
 * resume（suspended→active）、delete（软→deleted 终态）；硬删租户连带清除其名下**所有组织**及子表（不可逆·FK cascade）。
 * 组织降级为租户名册下的下钻/绑定面：诊断/导出/ Odoo 绑定仍 org 级（一组织一公司），经租户详情路径抵达。
 * 每次成功/失败均落结构化审计行（FR-6）。
 * @public
 */
// 换轨 WP-C：九路由转 per-method `@Impl`——class 级 `@TenantIsolationExempt()` + `@UseGuards(PlatformOperatorGuard)`
// 原生保留（跨租平台治理墙不弱化）。旧 `@SerializeOptions` 白名单换 `.output`；`@CurrentUser()` 换 `context.user`；
// `:tenantId`/`:orgId` 路径参经紧凑 input 结构合并（纯参=`platformTenantIdParamSchema`·body⊕参=`setTenantOrgVisibilityInputSchema`·
// 下钻双参=`platformOrgDrilldownParamSchema`）。in-handler `NotFoundException`（含 errorCode）经 WP-D 错误面逐字承接。
// exportData 旧 `apiOkPassthrough`（bulk-export 六段·不挂白名单）→ 不挂 `.output`（逐字透传）。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export {
  platformTenantsDetailContract,
  platformTenantsDiagnosticsContract,
  platformTenantsExportContract,
  platformTenantsListContract,
  platformTenantsPermanentRemoveContract,
  platformTenantsRemoveContract,
  platformTenantsResumeContract,
  platformTenantsSuspendContract,
  platformTenantsVisibilityContract,
};

@Controller('')
@TenantIsolationExempt()
@UseGuards(PlatformOperatorGuard)
export class PlatformTenantsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 跨平台列出所有租户（仅操作员·offset 分页·每行携名下组织计数）。
   */
  @Impl(platformTenantsListContract)
  list() {
    return os
      .input(listPlatformTenantsQuerySchema)
      .output(platformTenantPageSchema)
      .meta(platformTenantsListMeta)
      .handler(({ input }) =>
        this.queryBus.execute<ListPlatformTenantsQuery, PlatformTenantPage>(
          new ListPlatformTenantsQuery(input.limit, input.offset, input.search),
        ),
      );
  }

  /**
   * 取单个租户详情（仅操作员·tenant 基本盘 + 名下组织名册·未命中 404 经 WP-D 承接）。
   */
  @Impl(platformTenantsDetailContract)
  detail() {
    return os
      .input(platformTenantIdParamSchema)
      .output(platformTenantDetailSchema)
      .meta(platformTenantsDetailMeta)
      .handler(async ({ input }) => {
        const detail = await this.queryBus.execute<
          GetPlatformTenantQuery,
          PlatformTenantDetail | null
        >(new GetPlatformTenantQuery(input.tenantId));
        if (!detail)
          throw new NotFoundException('Tenant not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return detail;
      });
  }

  /**
   * 暂停生效租户（active→suspended·封禁整个租户·fail-closed 失能·未命中 404/非法转移 409 经 WP-D 承接）。
   */
  @Impl(platformTenantsSuspendContract)
  suspend() {
    return os
      .input(platformTenantIdParamSchema)
      .output(tenantGovernanceResultSchema)
      .meta(platformTenantsSuspendMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          SuspendOrganizationCommand,
          TenantGovernanceResult | null
        >(new SuspendOrganizationCommand(input.tenantId, user.id));
        if (!result)
          throw new NotFoundException('Tenant not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return result;
      });
  }

  /**
   * 恢复已暂停租户（suspended→active·未命中 404/非法转移 409 经 WP-D 承接）。
   */
  @Impl(platformTenantsResumeContract)
  resume() {
    return os
      .input(platformTenantIdParamSchema)
      .output(tenantGovernanceResultSchema)
      .meta(platformTenantsResumeMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          ResumeOrganizationCommand,
          TenantGovernanceResult | null
        >(new ResumeOrganizationCommand(input.tenantId, user.id));
        if (!result)
          throw new NotFoundException('Tenant not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return result;
      });
  }

  /**
   * 设置该租户租内跨组织可见性策略（第三次复裁切片 3·D2·未命中 404 经 WP-D 承接）。
   */
  @Impl(platformTenantsVisibilityContract)
  setVisibility() {
    return os
      .input(setTenantOrgVisibilityInputSchema)
      .output(tenantOrgVisibilityResultSchema)
      .meta(platformTenantsVisibilityMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          SetTenantOrgVisibilityCommand,
          TenantOrgVisibilityResult | null
        >(
          new SetTenantOrgVisibilityCommand(
            input.tenantId,
            input.orgVisibility as OrgVisibility,
            user.id,
          ),
        );
        if (!result)
          throw new NotFoundException('Tenant not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return result;
      });
  }

  /**
   * 软删租户（→deleted 终态·封禁整个租户·行保留供导出·未命中 404/已删 409 经 WP-D 承接）。
   */
  @Impl(platformTenantsRemoveContract)
  remove() {
    return os
      .input(platformTenantIdParamSchema)
      .output(tenantGovernanceResultSchema)
      .meta(platformTenantsRemoveMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          DeleteOrganizationCommand,
          TenantGovernanceResult | null
        >(new DeleteOrganizationCommand(input.tenantId, user.id));
        if (!result)
          throw new NotFoundException('Tenant not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return result;
      });
  }

  /**
   * 硬删已处 deleted 终态的租户（不可逆·连带清除名下所有组织及子表 + 事件清除·NFR-6·未命中/幂等 404/非终态 409 经 WP-D 承接）。
   */
  @Impl(platformTenantsPermanentRemoveContract)
  permanentRemove() {
    return os
      .input(platformTenantIdParamSchema)
      .output(tenantHardDeleteResultSchema)
      .meta(platformTenantsPermanentRemoveMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          DeleteOrganizationPermanentlyCommand,
          TenantHardDeleteResult | null
        >(new DeleteOrganizationPermanentlyCommand(input.tenantId, user.id));
        if (!result)
          throw new NotFoundException('Tenant not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return result;
      });
  }

  /**
   * 组织级诊断下钻：成员/邀请/工作区/帖子计数（经租户详情抵达·未命中 404 经 WP-D 承接）。
   */
  @Impl(platformTenantsDiagnosticsContract)
  diagnostics() {
    return os
      .input(platformOrgDrilldownParamSchema)
      .output(organizationDiagnosticsSchema)
      .meta(platformTenantsDiagnosticsMeta)
      .handler(async ({ input }) => {
        const diag = await this.queryBus.execute<
          GetOrganizationDiagnosticsQuery,
          OrganizationDiagnostics | null
        >(new GetOrganizationDiagnosticsQuery(input.orgId));
        if (!diag)
          throw new NotFoundException('Organization not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return diag;
      });
  }

  /**
   * 导出该组织全部数据为单一 JSON（NFR-6·不含凭证·经租户详情下钻·未命中 404 经 WP-D 承接）。
   */
  @Impl(platformTenantsExportContract)
  exportData() {
    return os
      .input(platformOrgDrilldownParamSchema)
      .output(organizationDataExportViewSchema)
      .meta(platformTenantsExportMeta)
      .handler(async ({ input }) => {
        const payload = await this.queryBus.execute<
          ExportOrganizationDataQuery,
          OrganizationDataExport | null
        >(new ExportOrganizationDataQuery(input.orgId));
        if (!payload)
          throw new NotFoundException('Organization not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        return payload;
      });
  }
}

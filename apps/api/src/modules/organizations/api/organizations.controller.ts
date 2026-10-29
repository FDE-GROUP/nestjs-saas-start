import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import { Controller, Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Impl } from '@orpc/nest';
import {
  orgApplyMeta,
  orgApproveMeta,
  organizationsApplyContract,
  organizationsApproveContract,
  organizationsBindOdooContract,
  organizationsRejectContract,
  orgBindOdooMeta,
  orgRejectMeta,
} from '@saas/api-contract/index';
import {
  bindOdooCompanyInputSchema,
  createOrganizationApplicationSchema,
  organizationApplicationViewSchema,
  organizationIdParamSchema,
  organizationOdooBindingViewSchema,
} from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';
import { requireSessionUser } from '../../../common/orpc/orpc-context';
import { ApproveOrganizationCommand } from '../application/commands/approve-organization.command';
import { BindOrganizationOdooCompanyCommand } from '../application/commands/bind-organization-odoo-company.command';
import { RejectOrganizationCommand } from '../application/commands/reject-organization.command';
import { SubmitOrganizationApplicationCommand } from '../application/commands/submit-organization-application.command';
import type { OrganizationApplicationReadModel } from '../application/read-models/organization-application.read-model';
import type { OrganizationOdooBindingReadModel } from '../application/read-models/organization-odoo-binding.read-model';
import { mapBaError } from './ba-error.mapping';

/**
 * 租户申请/审批参考切片端点（global-tenancy S4 · FR-1/FR-11/FR-12）。
 *
 * @remarks
 * FR-11 three-layer separation is expressed by the guard chosen PER ROUTE — none of these
 * is tenant-scoped (you have no active tenant while applying; approval is cross-tenant):
 * - `POST /organizations/applications`         → user-level (SessionGuard): authenticated user applies.
 * - `POST /organizations/applications/:id/approve|reject` → platform-level (PlatformOperatorGuard).
 *
 * Applying creates a `pending_approval` organization (self-service instant provisioning is
 * closed at the BA layer — `allowUserToCreateOrganization:false`); the applicant becomes the
 * first `owner` via BA (FR-12). A pending tenant binds no tenant context, so its business
 * routes fail closed until an operator approves it (S4 middleware deny-list).
 * @public
 */
// 换轨 WP-C：四路由转 per-method `@Impl`（非 router 扇出）——逐路由 `@UseGuards`（会话墙/平台治理墙）原生保留。
// 已认证主体经 `context.user`（取代 `@CurrentUser()`·全局 SessionGuard 已挂 sessionUser）；`:id` 路径参经紧凑
// input 平并入单一对象（approve/reject 仅 `{id}`·bind 为 body ⊕ id）；旧 `@SerializeOptions` 白名单下沉 `.output`。
// in-handler `NotFoundException`（含 errorCode）与 `mapBaError` 抛的 `HttpException` 皆经 WP-D 错误面承接逐字复原。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export {
  organizationsApplyContract,
  organizationsApproveContract,
  organizationsBindOdooContract,
  organizationsRejectContract,
};

// S11 复合全局：建租申请（此刻无 active 租·鸡生蛋）+ approve/reject（跨租平台治理）皆合法无租户 → 类级豁免租户墙。
@TenantIsolationExempt()
@Controller('')
export class OrganizationsController {
  constructor(@Inject(CommandBus) private readonly commandBus: CommandBus) {}

  /**
   * 已登录用户提交建租申请，落 pending_approval。
   * @returns 新建的待批租户读模型；BA 重复 slug 等 4xx 经 `mapBaError` 归一透传。
   */
  @UseGuards(SessionGuard)
  @Impl(organizationsApplyContract)
  apply() {
    return os
      .input(createOrganizationApplicationSchema)
      .output(organizationApplicationViewSchema)
      .meta(orgApplyMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        // 建租经 BA `createOrganization` 服务端系统动作：重复 slug 等 4xx `APIError` 走门面统一出口
        // `mapBaError` 归一透传状态（避免逃逸为 500·对齐 epic-02 §2.1·module-rbac-casl §2.3.1）。
        try {
          return await this.commandBus.execute<
            SubmitOrganizationApplicationCommand,
            OrganizationApplicationReadModel
          >(new SubmitOrganizationApplicationCommand(user.id, input.name, input.slug));
        } catch (err) {
          return mapBaError(err);
        }
      });
  }

  /**
   * 平台运营者批准 pending 租户（pending → active）。
   * @returns 激活后的租户读模型；查无抛 404（经 WP-D 承接）。
   */
  @UseGuards(PlatformOperatorGuard)
  @Impl(organizationsApproveContract)
  approve() {
    return os
      .input(organizationIdParamSchema)
      .output(organizationApplicationViewSchema)
      .meta(orgApproveMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          ApproveOrganizationCommand,
          OrganizationApplicationReadModel | null
        >(new ApproveOrganizationCommand(input.id, user.id));
        if (!result) {
          throw new NotFoundException('Organization application not found', {
            errorCode: ERROR_CODES.ORG_PROVISIONING_NOT_FOUND,
          });
        }
        return result;
      });
  }

  /**
   * 平台运营者驳回 pending 租户（硬删·204）。
   * @returns 无；查无抛 404（经 WP-D 承接）。
   */
  @UseGuards(PlatformOperatorGuard)
  @Impl(organizationsRejectContract)
  reject() {
    return os
      .input(organizationIdParamSchema)
      .meta(orgRejectMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const removed = await this.commandBus.execute<RejectOrganizationCommand, boolean>(
          new RejectOrganizationCommand(input.id, user.id),
        );
        if (!removed) {
          throw new NotFoundException('Organization application not found', {
            errorCode: ERROR_CODES.ORG_PROVISIONING_NOT_FOUND,
          });
        }
      });
  }

  /**
   * 平台运营者 bind-existing 回填：把 Odoo 侧现存公司绑定给 active 租户（切片 A 通道）。
   * @returns 绑定回执；查无 404·占用/非 active 由 handler 抛 409（皆经 WP-D 承接）。
   */
  @UseGuards(PlatformOperatorGuard)
  @Impl(organizationsBindOdooContract)
  bindOdooCompany() {
    return os
      .input(bindOdooCompanyInputSchema)
      .output(organizationOdooBindingViewSchema)
      .meta(orgBindOdooMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          BindOrganizationOdooCompanyCommand,
          OrganizationOdooBindingReadModel | null
        >(
          new BindOrganizationOdooCompanyCommand(
            input.id,
            input.odooCompanyId,
            input.odooCompanyName,
            user.id,
          ),
        );
        if (!result) {
          throw new NotFoundException('Organization not found', {
            errorCode: ERROR_CODES.ORG_NOT_FOUND,
          });
        }
        return result;
      });
  }
}

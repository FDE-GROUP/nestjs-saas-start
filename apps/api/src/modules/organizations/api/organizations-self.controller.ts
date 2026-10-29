import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  AUTH_SESSION_STORE,
  type AuthSessionStore,
} from '@app/modules/auth/domain/ports/session-store.port';
import { canUseOdoo } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import {
  ORGANIZATION_ODOO_BINDING_READER,
  type OrganizationOdooBindingReader,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import { Controller, ForbiddenException, Inject, UseGuards } from '@nestjs/common';
import { Impl } from '@orpc/nest';
import {
  selfAcceptContract,
  selfAcceptMeta,
  selfLeaveContract,
  selfLeaveMeta,
  selfListContract,
  selfListInvitationsContract,
  selfListInvitationsMeta,
  selfListMeta,
  selfOdooAvailabilityContract,
  selfOdooAvailabilityMeta,
  selfRejectContract,
  selfRejectMeta,
  selfSetActiveContract,
  selfSetActiveMeta,
} from '@saas/api-contract/index';
import {
  acceptInvitationResultSchema,
  invitationIdSchema,
  leaveOrganizationSchema,
  okResponseSchema,
  organizationOdooAvailabilityViewSchema,
  setActiveOrganizationSchema,
  tenantInvitationViewListSchema,
} from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';
import { requireSessionUser } from '../../../common/orpc/orpc-context';
import { TenantMemberFacadeService } from '../application/tenant-member-facade.service';
import { mapBaError } from './ba-error.mapping';

/** BA org 个人通道窄类型（服务端 API·非 HTTP）。 */
interface OrganizationSelfApi {
  listOrganizations(p: { headers: Record<string, unknown> }): Promise<unknown>;
  setActiveOrganization(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
  leaveOrganization(p: { headers: Record<string, unknown>; body: unknown }): Promise<unknown>;
}

/**
 * 租户**个人通道门面**（module-rbac-casl §2.3.1·甲裁严格拆·self 侧）。
 *
 * @remarks
 * 与 `OrganizationsOrgAdminController`（管理门面）的分工：本控制器全部端点是「个人对自己成员资格/
 * 邀请的操作」——**合法无 active 租户也可达**（列表/接受邀请皆发生于入组前），故类级
 * `@TenantIsolationExempt()` 旁路租户墙、逐路由 `SessionGuard` 保会话必需；授权语义由 BA 数据面
 * 自身裁决（membership 归属、被邀请人=本人、last-owner 不可退等），CASL 不介入
 * （CASL 矩阵管的是「租户内管理职权」，见 admin 门面）。
 *
 * 数据操作 = BA `auth.api.*` 服务端直调（窄门面透传·BA 侧 hooks/校验照旧，含 seats 配额），
 * 不经被封堵的 BA 内置 org HTTP 面。
 * @public
 */
// 换轨 WP-C：七路由转 per-method `@Impl`——class 级 `@TenantIsolationExempt()` + 逐方法 `@UseGuards(SessionGuard)`
// 原生保留（会话墙不弱化·401 先于 handler）。旧 `@CurrentUser()` 换 `context.user`、`@Headers()` 换 `context.headers`
// （BA 服务端直调透传）。`apiOkPassthrough` 面（list/setActive/leave/accept/reject/listMyInvitations）不挂 `.output`
// （透传逐字保真）；仅 odooAvailability 旧 `@SerializeOptions` 换 `.output(organizationOdooAvailabilityViewSchema)`。
// `mapBaError` 出口经 WP-D 错误面归一为逐字 REST 信封。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export {
  selfAcceptContract,
  selfLeaveContract,
  selfListContract,
  selfListInvitationsContract,
  selfOdooAvailabilityContract,
  selfRejectContract,
  selfSetActiveContract,
};

@Controller('')
@TenantIsolationExempt()
export class OrganizationsSelfController {
  constructor(
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(ORGANIZATION_ODOO_BINDING_READER)
    private readonly bindings: OrganizationOdooBindingReader,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
    @Inject(AUTH_SESSION_STORE) private readonly sessions: AuthSessionStore,
    private readonly facade: TenantMemberFacadeService,
  ) {}

  private ba(): OrganizationSelfApi {
    const auth = this.authInstance.get();
    if (!auth)
      throw new ForbiddenException('Auth instance not initialized', {
        errorCode: ERROR_CODES.AUTH_PROVIDER_UNAVAILABLE,
      });
    return auth.api as unknown as OrganizationSelfApi;
  }

  /**
   * 列出当前用户所属的租户（个人通道·BA passthrough）。
   */
  @UseGuards(SessionGuard)
  @Impl(selfListContract)
  listMyOrganizations() {
    return os.meta(selfListMeta).handler(async ({ context }) => {
      try {
        return await this.ba().listOrganizations({ headers: context.headers ?? {} });
      } catch (err) {
        return mapBaError(err);
      }
    });
  }

  /**
   * 切换会话的 active 组织（须为其成员·BA passthrough·非成员 403 经 `mapBaError` 归一→WP-D 承接）。
   */
  @UseGuards(SessionGuard)
  @Impl(selfSetActiveContract)
  setActive() {
    return os
      .input(setActiveOrganizationSchema)
      .meta(selfSetActiveMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        try {
          const result = await this.ba().setActiveOrganization({
            headers: context.headers ?? {},
            body: input,
          });
          // P0 修复 X2（双激活位互斥）：BA 写完 activeOrganizationId 后清 activeTenantId（与 setActiveTenant
          // 反向成对），杜绝 `{activeTenantId=T1, activeOrganizationId=O2∈T2}` 混态→租内跨租借权。sessionId 缺
          // 位（旧会话）→ 跳过清位（仍有中间件读侧 org∈tenant 校验兜底）。
          if (user.sessionId) {
            await this.sessions.clearActiveTenant(user.sessionId);
          }
          return result;
        } catch (err) {
          return mapBaError(err);
        }
      });
  }

  /**
   * 自助退租（X7 切片 G·G1 租级换轴：经门面 `leaveSelf` 撤租级两表 + 连清 BA member·唯一 owner 拒退 403/非成员 404 经 WP-D 承接）。
   */
  @UseGuards(SessionGuard)
  @Impl(selfLeaveContract)
  leave() {
    return os
      .input(leaveOrganizationSchema)
      .output(okResponseSchema)
      .meta(selfLeaveMeta)
      .handler(async ({ context }) => {
        const user = requireSessionUser(context);
        await this.facade.leaveSelf(user.id);
        return { ok: true };
      });
  }

  /**
   * 接受发给当前用户的邀请（X7 租级化·无效/过期 404/非受邀人 403/席位超限 402 经门面守卫→WP-D 承接）。
   */
  @UseGuards(SessionGuard)
  @Impl(selfAcceptContract)
  acceptInvitation() {
    return os
      .input(invitationIdSchema)
      .output(acceptInvitationResultSchema)
      .meta(selfAcceptMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        return this.facade.acceptInvitation(input.invitationId, {
          userId: user.id,
          email: user.email,
        });
      });
  }

  /**
   * 拒绝发给当前用户的邀请（X7 租级化·非 pending/邮箱不符 → 404 经 WP-D 承接）。
   */
  @UseGuards(SessionGuard)
  @Impl(selfRejectContract)
  rejectInvitation() {
    return os
      .input(invitationIdSchema)
      .output(okResponseSchema)
      .meta(selfRejectMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        await this.facade.rejectInvitation(input.invitationId, user.email);
        return { ok: true };
      });
  }

  /**
   * 列出发给当前用户的待处理邀请（X7 租级化·跨租个人可见面·BA passthrough）。
   */
  @UseGuards(SessionGuard)
  @Impl(selfListInvitationsContract)
  listMyInvitations() {
    return os
      .output(tenantInvitationViewListSchema)
      .meta(selfListInvitationsMeta)
      .handler(async ({ context }) => {
        const user = requireSessionUser(context);
        return this.facade.listMyInvitations(user.email);
      });
  }

  /**
   * 读当前活跃租户的 Odoo 可用性（apps 面板数据源·module-org-odoo-company-mapping 切片 D）。
   *
   * @remarks
   * 软读会话活跃租户（本路由随类级 `@TenantIsolationExempt`·无活跃 org 不 403 而返「不可用」——面板
   * 需在未入组/未选租户态也能渲染），命中则经 published reader 端口取绑定行喂 `canUseOdoo` 单源裁决
   * （与 SSO/RPC 门禁同口径·三点门禁不漂移）。**不**触 Odoo·只读 SaaS 侧绑定态。
   */
  @UseGuards(SessionGuard)
  @Impl(selfOdooAvailabilityContract)
  odooAvailability() {
    return os
      .output(organizationOdooAvailabilityViewSchema)
      .meta(selfOdooAvailabilityMeta)
      .handler(async () => {
        const organizationId = this.tenant.organizationId;
        if (!organizationId)
          return { available: false, odooBindingStatus: null, odooCompanyId: null };
        const row = await this.bindings.read(organizationId);
        if (!row) return { available: false, odooBindingStatus: null, odooCompanyId: null };
        return {
          available: canUseOdoo({
            status: row.organizationStatus,
            odooBindingStatus: row.odooBindingStatus,
            odooCompanyId: row.odooCompanyId,
          }),
          odooBindingStatus: row.odooBindingStatus,
          odooCompanyId: row.odooCompanyId,
        };
      });
  }
}

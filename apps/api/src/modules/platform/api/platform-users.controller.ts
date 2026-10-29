import { ResumeUserCommand } from '@app/modules/organizations/application/commands/resume-user.command';
import { SuspendUserCommand } from '@app/modules/organizations/application/commands/suspend-user.command';
import { ListPlatformUsersQuery } from '@app/modules/organizations/application/queries/list-platform-users.query';
import type {
  PlatformUserPage,
  UserGovernanceResult,
} from '@app/modules/organizations/application/read-models/platform-user.read-model';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import { Controller, Inject, NotFoundException, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Impl } from '@orpc/nest';
import {
  platformUsersListContract,
  platformUsersListMeta,
  platformUsersResumeContract,
  platformUsersResumeMeta,
  platformUsersSuspendContract,
  platformUsersSuspendMeta,
} from '@saas/api-contract/index';
import {
  listPlatformUsersQuerySchema,
  platformUserIdParamSchema,
  platformUserPageSchema,
  suspendUserInputSchema,
  userGovernanceResultSchema,
} from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';
import { requireSessionUser } from '../../../common/orpc/orpc-context';

/**
 * 平台操作员用户治理切片的 HTTP 控制器（多租户 S6 · FR-6/FR-10/FR-11①/FR-13）。
 *
 * @remarks
 * Platform operator user-governance slice (global-tenancy S6 · FR-6/FR-10/FR-11①/FR-13).
 *
 * Every route is gated by `PlatformOperatorGuard` (the sole cross-platform authority, fail-closed).
 * These handlers act WITHOUT a tenant scope on purpose: suspending a platform user revokes their
 * access across every tenant and the platform layer (FR-10/FR-11), so they never bind TenantIsolationGuard.
 *
 * suspend (active→suspended) additionally hard-invalidates the user's sessions (D4 · §159);
 * resume (suspended→active) lifts the deny-list. Each success/failure emits a structured audit line (FR-6).
 * @public
 */
// 换轨 WP-C：三条路由转 per-method `@Impl`——class 级 `@TenantIsolationExempt()` + `@UseGuards(PlatformOperatorGuard)`
// 原生保留（跨租平台治理墙不弱化）。旧 `@SerializeOptions` 白名单换落点 procedure 级 `.output`（zod 单源不变）；
// `@CurrentUser()` 换 `context.user`（经 `requireSessionUser`）；`:id` 路径参经紧凑 input 结构合并
// （suspend body⊕id=`suspendUserInputSchema`·resume 纯参=`platformUserIdParamSchema`）。in-handler
// `NotFoundException`（含 errorCode）经 WP-D 错误面逐字承接为 REST 404 信封。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export { platformUsersListContract, platformUsersResumeContract, platformUsersSuspendContract };

@Controller('')
@TenantIsolationExempt()
@UseGuards(PlatformOperatorGuard)
export class PlatformUsersController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 跨平台列出所有用户及生命周期状态（仅操作员·offset 分页）。
   * @returns 带封禁状态的用户分页页。
   */
  @Impl(platformUsersListContract)
  list() {
    return os
      .input(listPlatformUsersQuerySchema)
      .output(platformUserPageSchema)
      .meta(platformUsersListMeta)
      .handler(({ input }) =>
        this.queryBus.execute<ListPlatformUsersQuery, PlatformUserPage>(
          new ListPlatformUsersQuery(input.limit, input.offset, input.search),
        ),
      );
  }

  /**
   * 暂停平台用户（active→suspended·会话失效·fail-closed 失能·未命中 404/非法转移 409 经 WP-D 承接）。
   */
  @Impl(platformUsersSuspendContract)
  suspend() {
    return os
      .input(suspendUserInputSchema)
      .output(userGovernanceResultSchema)
      .meta(platformUsersSuspendMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          SuspendUserCommand,
          UserGovernanceResult | null
        >(new SuspendUserCommand(input.id, user.id, input.reason));
        if (!result)
          throw new NotFoundException('User not found', { errorCode: ERROR_CODES.USER_NOT_FOUND });
        return result;
      });
  }

  /**
   * 恢复已暂停的平台用户（suspended→active·未命中 404/非法转移 409 经 WP-D 承接）。
   */
  @Impl(platformUsersResumeContract)
  resume() {
    return os
      .input(platformUserIdParamSchema)
      .output(userGovernanceResultSchema)
      .meta(platformUsersResumeMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        const result = await this.commandBus.execute<
          ResumeUserCommand,
          UserGovernanceResult | null
        >(new ResumeUserCommand(input.id, user.id));
        if (!result)
          throw new NotFoundException('User not found', { errorCode: ERROR_CODES.USER_NOT_FOUND });
        return result;
      });
  }
}

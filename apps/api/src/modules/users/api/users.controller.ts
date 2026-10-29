import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import { Controller, Inject, Logger, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Impl } from '@orpc/nest';
import {
  usersDeleteContract,
  usersDeleteMeta,
  usersExportContract,
  usersExportMeta,
} from '@saas/api-contract/index';
import { os } from '../../../common/orpc/orpc';
import { requireSessionUser } from '../../../common/orpc/orpc-context';
import { SessionGuard } from '../../auth/api/guards/session.guard';
import { DeleteUserCommand } from '../application/commands/delete-user.command';
import { ExportUserDataQuery } from '../application/queries/export-user-data.query';
import type { UserDataExportReadModel } from '../application/read-models/user-data-export.read-model';

/**
 * 用户自助面端点（仅本人导出 / 本人删除，PIPL 正当通道，各挂 SessionGuard）。
 *
 * @remarks
 * 暴露面收紧（module-users-surface-reduction·人裁甲）：原 `POST /users`・
 * `GET /users`・`GET /users/:id` 已删除——`user` 表无租户列，三路由为跨租户 PII
 * 冗余危险面且全仓零消费方；管理员查全用户走治理面 `/tenants/admin/users`
 * （PlatformOperatorGuard），建号正道收口 better-auth sign-up。
 * @public
 */
// 换轨 WP-C：两路由转 per-method `@Impl`（无入参·output passthrough 不挂 .output·逐字保真）。
// 已认证主体经 `context.user`（orpc-context 增强 DefaultInitialContext·取 SessionGuard 挂的 req.sessionUser）·
// 取代旧 `@CurrentUser()`；方法级 `@UseGuards(SessionGuard)` 原生保留（会话墙不弱化）。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export { usersDeleteContract, usersExportContract };

// S11 复合全局：users 全路由属用户级（不经租户仓储）·需登录但合法无租户 → 类级豁免全局租户墙。
@TenantIsolationExempt()
@Controller('')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * PIPL 右-access：导出当前用户全部个人数据（凭据除外）。
   * @returns 四段聚合的个人数据导出体。
   */
  @UseGuards(SessionGuard)
  @Impl(usersExportContract)
  exportMe() {
    return os.meta(usersExportMeta).handler(async ({ context }) => {
      const user = requireSessionUser(context);
      this.logger.log(`Exporting personal data for user ${user.id}`);
      return this.queryBus.execute<ExportUserDataQuery, UserDataExportReadModel>(
        new ExportUserDataQuery(user.id),
      );
    });
  }

  /**
   * PIPL 右-erase：硬删当前用户（consent 匿名留存）。
   */
  @UseGuards(SessionGuard)
  @Impl(usersDeleteContract)
  deleteMe() {
    return os.meta(usersDeleteMeta).handler(async ({ context }) => {
      const user = requireSessionUser(context);
      this.logger.log(`Deleting user ${user.id} (PIPL right-to-erase)`);
      await this.commandBus.execute<DeleteUserCommand, void>(new DeleteUserCommand(user.id));
    });
  }
}

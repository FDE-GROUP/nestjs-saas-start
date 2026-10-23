import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiError,
  apiOkPassthrough,
} from '../../../common/contracts/api-contracts';
import { CurrentUser } from '../../auth/api/decorators/current-user.decorator';
import { SessionGuard, type SessionUser } from '../../auth/api/guards/session.guard';
import { DeleteUserCommand } from '../application/commands/delete-user.command';
import { ExportUserDataQuery } from '../application/queries/export-user-data.query';
import type { UserDataExportReadModel } from '../application/read-models/user-data-export.read-model';

/**
 * Users controller.
 *
 * 暴露面收紧（module-users-surface-reduction·人裁甲）：原 `POST /users`・
 * `GET /users`・`GET /users/:id` 已删除——`user` 表无租户列，三路由为跨租户 PII
 * 冗余危险面且全仓零消费方；管理员查全用户走治理面 `/tenants/admin/users`
 * （PlatformOperatorGuard），建号正道收口 better-auth sign-up。仅存用户自助面
 * （本人导出 / 本人删除，PIPL 正当通道），各挂 SessionGuard。
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse)
@ApiTags('users')
// S11 复合全局：users 全路由属用户级（不经租户仓储）·需登录但合法无租户 → 类级豁免全局租户墙。
@TenantIsolationExempt()
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get('me/data-export')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'PIPL right-to-access: export current user personal data (C1 · FR-7)' })
  @ApiResponse(
    apiOkPassthrough({
      description: 'Aggregated personal data (no credentials)',
      ssotHint: 'UserDataExportReadModel（bulk-export·四段聚合）',
    }),
  )
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  async exportMe(@CurrentUser() user: SessionUser): Promise<UserDataExportReadModel> {
    this.logger.log(`Exporting personal data for user ${user.id}`);
    return this.queryBus.execute<ExportUserDataQuery, UserDataExportReadModel>(
      new ExportUserDataQuery(user.id),
    );
  }

  @Delete('me')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'PIPL right-to-erase: hard-delete current user (C1 · FR-7)' })
  @ApiResponse({ status: 204, description: 'User deleted; consent rows retained anonymously.' })
  @ApiResponse(apiError(401, 'Missing or invalid session.'))
  async deleteMe(@CurrentUser() user: SessionUser): Promise<void> {
    this.logger.log(`Deleting user ${user.id} (PIPL right-to-erase)`);
    await this.commandBus.execute<DeleteUserCommand, void>(new DeleteUserCommand(user.id));
  }
}

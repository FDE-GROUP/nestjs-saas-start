import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
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
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type ListPlatformUsersQuery as ListPlatformUsersQueryDto,
  listPlatformUsersQuerySchema,
  platformUserPageSchema,
  type SuspendUser,
  suspendUserSchema,
  userGovernanceResultSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import {
  PlatformUserPageResponse,
  UserGovernanceResultResponse,
} from './response/governance.response';

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
@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  PlatformUserPageResponse,
  UserGovernanceResultResponse,
)
@ApiTags('platform')
// S11 复合全局：跨租平台治理（operator 行动时无关租户上下文）→ 类级豁免租户墙（仍由 PlatformOperatorGuard 逐路由卡）。
@TenantIsolationExempt()
@Controller('platform/users')
@UseGuards(PlatformOperatorGuard)
export class PlatformUsersController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 跨平台列出所有用户及生命周期状态（仅操作员·offset 分页）。
   * @param dto - 分页与搜索请求。
   * @returns 带封禁状态的用户分页页。
   */
  @Get()
  @SerializeOptions({ schema: platformUserPageSchema })
  @ApiOperation({ summary: 'List all platform users with lifecycle status (operator only)' })
  @ApiResponse(
    apiEnvelopeShape(PlatformUserPageResponse, {
      description: 'A page of users with suspension status.',
    }),
  )
  @ApiResponse(apiError(403, 'Not the platform operator.'))
  list(
    @Query({ schema: listPlatformUsersQuerySchema }) dto: ListPlatformUsersQueryDto,
  ): Promise<PlatformUserPage> {
    return this.queryBus.execute<ListPlatformUsersQuery, PlatformUserPage>(
      new ListPlatformUsersQuery(dto.limit, dto.offset, dto.search),
    );
  }

  /**
   * 暂停平台用户（active→suspended·会话失效·fail-closed 失能）。
   * @param id - 用户主键。
   * @param user - 当前操作员会话。
   * @param dto - 暂停入参（可选 reason）。
   * @returns 用户治理结果；未命中 404、非法转移 409。
   *
   * @throws {NotFoundException} 用户不存在时。
   */
  @Patch(':id/suspend')
  @SerializeOptions({ schema: userGovernanceResultSchema })
  @ApiOperation({
    summary:
      'Suspend a platform user (active → suspended · sessions invalidated · fail-closed失能)',
  })
  @ApiResponse(apiEnvelopeShape(UserGovernanceResultResponse, { description: 'User suspended.' }))
  @ApiResponse(apiError(404, 'User not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async suspend(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body({ schema: suspendUserSchema }) dto: SuspendUser,
  ): Promise<UserGovernanceResult> {
    const result = await this.commandBus.execute<SuspendUserCommand, UserGovernanceResult | null>(
      new SuspendUserCommand(id, user.id, dto?.reason),
    );
    if (!result)
      throw new NotFoundException('User not found', { errorCode: ERROR_CODES.USER_NOT_FOUND });
    return result;
  }

  /**
   * 恢复已暂停的平台用户（suspended→active）。
   * @param id - 用户主键。
   * @param user - 当前操作员会话。
   * @returns 用户治理结果；未命中 404、非法转移 409。
   *
   * @throws {NotFoundException} 用户不存在时。
   */
  @Patch(':id/resume')
  @SerializeOptions({ schema: userGovernanceResultSchema })
  @ApiOperation({ summary: 'Resume a suspended platform user (suspended → active)' })
  @ApiResponse(apiEnvelopeShape(UserGovernanceResultResponse, { description: 'User resumed.' }))
  @ApiResponse(apiError(404, 'User not found.'))
  @ApiResponse(apiError(409, 'Illegal transition for the current status.'))
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<UserGovernanceResult> {
    const result = await this.commandBus.execute<ResumeUserCommand, UserGovernanceResult | null>(
      new ResumeUserCommand(id, user.id),
    );
    if (!result)
      throw new NotFoundException('User not found', { errorCode: ERROR_CODES.USER_NOT_FOUND });
    return result;
  }
}

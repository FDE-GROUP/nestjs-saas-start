import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { CreateSubscriptionCommand } from '@core/saas-kit/modules/subscriptions/application/commands/create-subscription.command';
import { GetSubscriptionQuery } from '@core/saas-kit/modules/subscriptions/application/queries/get-current-subscription.query';
import type { OrganizationSubscriptionView } from '@core/saas-kit/modules/subscriptions/application/read-models/subscription.read-model';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type CreateSubscription,
  createSubscriptionSchema,
  subscriptionViewSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { SubscriptionResponse } from './response/subscription.response';

/**
 * 组织订阅切片的 HTTP 控制器（多租户 S7 · FR-7/FR-8/D5）。
 *
 * @remarks
 * Tenant subscription slice (global-tenancy S7 · FR-7/FR-8/D5).
 *
 * Per-route guards only — the global APP_GUARD stays a signed decision (高危#4):
 * - `GET /subscriptions/current`: `TenantIsolationGuard` (fail-closed · any authenticated
 *   member of the active organization reads their own plan/usage/mapping).
 * - `POST /subscriptions`: additionally `AuthorizationGuard` + `organization:update`
 *   (owner/admin change the plan). The route never names a tenant id — the repository
 *   stamps the ALS tenant (FR-5 single choke-point).
 *
 * Provision actually calls `PaymentService.createCustomer` to establish the tenant ↔
 * customer mapping (FR-8). Quota超限拒绝 (FR-7) is enforced via `QuotaService`/`QuotaGuard`;
 * the production member-add attach point (Better Auth route) is deferred to a later slice.
 * @public
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, SubscriptionResponse)
@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 读取当前组织的有效订阅快照（套餐/席位配额/用量/客户映射）。
   * @returns 当前组织的订阅视图。
   */
  @Get('current')
  @UseGuards(TenantIsolationGuard)
  @SerializeOptions({ schema: subscriptionViewSchema })
  @ApiOperation({
    summary: 'Current organization subscription: plan, seat quota, usage, customer mapping',
  })
  @ApiResponse(
    apiEnvelopeShape(SubscriptionResponse, {
      description: 'Effective subscription snapshot for the active organization.',
    }),
  )
  @ApiResponse(apiError(403, 'No active organization context.'))
  getCurrent(): Promise<OrganizationSubscriptionView> {
    return this.queryBus.execute<GetSubscriptionQuery, OrganizationSubscriptionView>(
      new GetSubscriptionQuery(),
    );
  }

  /**
   * 开通/升级组织订阅（创建支付供应商客户并落席位/存储/API 配额）。
   * @param dto - 开通入参（plan/customerEmail/seatsLimit/storageQuota/apiQuota）。
   * @returns 更新后的订阅快照视图。
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TenantIsolationGuard, AuthorizationGuard)
  @Can('update', 'Organization')
  @SerializeOptions({ schema: subscriptionViewSchema })
  @ApiOperation({
    summary: 'Provision/upgrade the organization subscription (creates the provider customer)',
  })
  @ApiResponse(
    apiEnvelopeShape(SubscriptionResponse, {
      status: 201,
      description: 'Subscription created; returns the updated snapshot.',
    }),
  )
  @ApiResponse(apiError(403, 'Not allowed to update the organization.'))
  @ApiResponse(apiError(503, 'No payment provider configured.'))
  create(
    @Body({ schema: createSubscriptionSchema }) dto: CreateSubscription,
  ): Promise<OrganizationSubscriptionView> {
    return this.commandBus.execute<CreateSubscriptionCommand, OrganizationSubscriptionView>(
      new CreateSubscriptionCommand(
        dto.plan,
        dto.customerEmail,
        dto.seatsLimit,
        dto.storageQuota,
        dto.apiQuota,
      ),
    );
  }
}

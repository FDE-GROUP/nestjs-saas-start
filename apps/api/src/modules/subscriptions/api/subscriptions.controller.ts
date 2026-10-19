import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantPermissionGuard } from '@core/saas-kit/authorization/tenant-permission.guard';
import { CreateSubscriptionCommand } from '@core/saas-kit/modules/subscriptions/application/commands/create-subscription.command';
import { GetSubscriptionQuery } from '@core/saas-kit/modules/subscriptions/application/queries/get-current-subscription.query';
import type { TenantSubscriptionView } from '@core/saas-kit/modules/subscriptions/application/read-models/subscription.read-model';
import { TenantScopeGuard } from '@core/saas-kit/tenancy/tenant-scope.guard';
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
 * Tenant subscription slice (global-tenancy S7 · FR-7/FR-8/D5).
 *
 * Per-route guards only — the global APP_GUARD stays a signed decision (高危#4):
 * - `GET /subscriptions/current`: `TenantScopeGuard` (fail-closed · any authenticated
 *   member of the active tenant reads their own plan/usage/mapping).
 * - `POST /subscriptions`: additionally `TenantPermissionGuard` + `organization:update`
 *   (owner/admin change the plan). The route never names a tenant id — the repository
 *   stamps the ALS tenant (FR-5 single choke-point).
 *
 * Provision actually calls `PaymentService.createCustomer` to establish the tenant ↔
 * customer mapping (FR-8). Quota超限拒绝 (FR-7) is enforced via `QuotaService`/`QuotaGuard`;
 * the production member-add attach point (Better Auth route) is deferred to a later slice.
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, SubscriptionResponse)
@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get('current')
  @UseGuards(TenantScopeGuard)
  @SerializeOptions({ schema: subscriptionViewSchema })
  @ApiOperation({
    summary: 'Current tenant subscription: plan, seat quota, usage, customer mapping',
  })
  @ApiResponse(
    apiEnvelopeShape(SubscriptionResponse, {
      description: 'Effective subscription snapshot for the active tenant.',
    }),
  )
  @ApiResponse(apiError(403, 'No active tenant context.'))
  getCurrent(): Promise<TenantSubscriptionView> {
    return this.queryBus.execute<GetSubscriptionQuery, TenantSubscriptionView>(
      new GetSubscriptionQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TenantScopeGuard, TenantPermissionGuard)
  @Can('update', 'Organization')
  @SerializeOptions({ schema: subscriptionViewSchema })
  @ApiOperation({
    summary: 'Provision/upgrade the tenant subscription (creates the provider customer)',
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
  ): Promise<TenantSubscriptionView> {
    return this.commandBus.execute<CreateSubscriptionCommand, TenantSubscriptionView>(
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

import { Public } from '@core/saas-kit/tenancy/public.decorator';
import { TenantExempt } from '@core/saas-kit/tenancy/tenant-exempt.decorator';
import type { RawBodyRequest } from '@nestjs/common';
import { Body, Controller, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CreateCheckout,
  type CreateCustomer,
  createCheckoutSchema,
  createCustomerSchema,
  paymentCheckoutRefSchema,
  paymentCustomerRefSchema,
  paymentRefundRefSchema,
  paymentStatusSchema,
  type RefundPayment,
  refundPaymentSchema,
  webhookAckSchema,
} from '@saas/contracts/index';
import type { FastifyRequest } from 'fastify';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { PaymentService } from '../application/payment.service';
import {
  PaymentCheckoutRefResponse,
  PaymentCustomerRefResponse,
  PaymentRefundRefResponse,
  PaymentStatusResponse,
  WebhookAckResponse,
} from './response/payment.response';

@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  PaymentStatusResponse,
  PaymentCustomerRefResponse,
  PaymentCheckoutRefResponse,
  PaymentRefundRefResponse,
  WebhookAckResponse,
)
@ApiTags('payment')
// S11 复合全局：payment 非 webhook 属用户级（Stripe customer/checkout·不经租户仓储）→ 类级豁免租户墙（仍需会话）；
// webhook 方法级 @Public 自动兼豁免会话+租户墙。
@TenantExempt()
@Controller('payment')
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  @Get('test')
  @SerializeOptions({ schema: paymentStatusSchema })
  @ApiOperation({ summary: 'Payment integration status' })
  @ApiResponse(
    apiEnvelopeShape(PaymentStatusResponse, {
      description: 'Current provider selection and available channels',
    }),
  )
  test() {
    return { status: 'ok', ...this.payment.describe() };
  }

  @Post('customers')
  @SerializeOptions({ schema: paymentCustomerRefSchema })
  @ApiOperation({ summary: 'Create a payment customer' })
  @ApiResponse(
    apiEnvelopeShape(PaymentCustomerRefResponse, {
      status: 201,
      description: 'Customer created successfully',
    }),
  )
  async createCustomer(@Body({ schema: createCustomerSchema }) createCustomerDto: CreateCustomer) {
    return this.payment.createCustomer(createCustomerDto);
  }

  @Post('checkouts')
  @SerializeOptions({ schema: paymentCheckoutRefSchema })
  @ApiOperation({ summary: 'Create a checkout (payment intent)' })
  @ApiResponse(
    apiEnvelopeShape(PaymentCheckoutRefResponse, {
      status: 201,
      description: 'Checkout created successfully',
    }),
  )
  @ApiResponse(apiError(400, 'Bad request'))
  async createCheckout(@Body({ schema: createCheckoutSchema }) createCheckoutDto: CreateCheckout) {
    return this.payment.createCheckout(createCheckoutDto);
  }

  @Get('checkouts/:id')
  @SerializeOptions({ schema: paymentCheckoutRefSchema })
  @ApiOperation({ summary: 'Retrieve a checkout' })
  @ApiParam({ name: 'id', description: 'Checkout (payment intent) ID' })
  @ApiResponse(
    apiEnvelopeShape(PaymentCheckoutRefResponse, {
      description: 'Checkout retrieved successfully',
    }),
  )
  @ApiResponse(apiError(404, 'Checkout not found'))
  async retrieveCheckout(@Param('id') id: string) {
    return this.payment.retrieveCheckout(id);
  }

  @Post('refunds')
  @SerializeOptions({ schema: paymentRefundRefSchema })
  @ApiOperation({ summary: 'Refund a checkout' })
  @ApiResponse(
    apiEnvelopeShape(PaymentRefundRefResponse, {
      status: 201,
      description: 'Refund created successfully',
    }),
  )
  @ApiResponse(apiError(400, 'Bad request'))
  async refund(@Body({ schema: refundPaymentSchema }) refundPaymentDto: RefundPayment) {
    return this.payment.refund(refundPaymentDto);
  }

  @Post('webhooks')
  // 入站回调靠 Stripe 签名校验而非会话·S11 显式旁路全局会话墙（deny-by-default 下的例外）。
  @Public()
  @SerializeOptions({ schema: webhookAckSchema })
  @ApiOperation({ summary: 'Handle payment webhook events' })
  @ApiHeader({ name: 'stripe-signature', description: 'Payment provider webhook signature' })
  @ApiResponse(
    apiEnvelopeShape(WebhookAckResponse, { description: 'Webhook processed successfully' }),
  )
  @ApiResponse(apiError(400, 'Invalid webhook signature'))
  async handleWebhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature: string,
  ) {
    const payload = request.rawBody?.toString() || '';
    const event = await this.payment.verifyWebhook(payload, signature);

    // 归一化事件类型分发点：新增通道只需在此按 event.type 收敛处理
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Handle successful payment
        break;
      case 'payment_intent.payment_failed':
        // Handle failed payment
        break;
    }

    return { received: true };
  }
}

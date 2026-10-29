import { Public } from '@core/saas-kit/tenant-isolation/public.decorator';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import type { RawBodyRequest } from '@nestjs/common';
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  SerializeOptions,
} from '@nestjs/common';
import { Impl } from '@orpc/nest';
import {
  paymentCreateCheckoutContract,
  paymentCreateCheckoutMeta,
  paymentCreateCustomerContract,
  paymentCreateCustomerMeta,
  paymentRefundContract,
  paymentRefundMeta,
  paymentRetrieveCheckoutContract,
  paymentRetrieveCheckoutMeta,
  paymentTestContract,
  paymentTestMeta,
} from '@saas/api-contract/index';
import {
  createCheckoutSchema,
  createCustomerSchema,
  paymentCheckoutIdParamSchema,
  paymentCheckoutRefSchema,
  paymentCustomerRefSchema,
  paymentRefundRefSchema,
  paymentStatusSchema,
  refundPaymentSchema,
  webhookAckSchema,
} from '@saas/contracts/index';
import type { FastifyRequest } from 'fastify';
import { os } from '../../../common/orpc/orpc';
import { PaymentService } from '../application/payment.service';

/**
 * 支付通道 HTTP 控制器：状态/客户/结账/退款/Webhook 端点，委托 `PaymentService`。
 *
 * @remarks
 * 非 webhook 属用户级（Stripe customer/checkout·不经租户仓储）→ 类级豁免租户墙（仍需会话）；
 * webhook 方法级 `@Public` 自动兼豁免会话+租户墙。
 * @public
 */
// 换轨 WP-C：五条常规路由（test/customers/checkouts/:id/refunds）转 per-method `@Impl`——class 级
// `@TenantIsolationExempt()` + 全局 `SessionGuard`（APP_GUARD）经 @Impl 落回本方法而原生保留（会话墙不弱化）；
// 旧 `@SerializeOptions` 白名单换 `.output`（zod 单源不变）。`@Impl` 恒施加 `HttpCode(successStatus)`（默认 200），
// 故资源创建三面显式 `successStatus: CREATED` 复原旧 POST 默认 201 语义（REST 一致性·项③）。
// ⚠ carve-out：`handleWebhook` **保留 REST**——入站回调靠 `request.rawBody` 原始字节做 Stripe 签名校验，
// 属传输层特化入口（同 storage.upload multipart 原始流 / oauth-sso 重定向面），强转 oRPC 需把 rawBody 经
// context 穿管并绕开 standard-schema 输入解析，风险落在校验/资金路径·按 plan §2-1 精神不静默改造。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export {
  paymentCreateCheckoutContract,
  paymentCreateCustomerContract,
  paymentRefundContract,
  paymentRetrieveCheckoutContract,
  paymentTestContract,
};

@Controller('')
@TenantIsolationExempt()
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  /**
   * 支付集成状态概览。
   * @returns 当前选中通道与可用通道。
   */
  @Impl(paymentTestContract)
  test() {
    return os
      .output(paymentStatusSchema)
      .meta(paymentTestMeta)
      .handler(() => ({
        status: 'ok' as const,
        ...this.payment.describe(),
      }));
  }

  /**
   * 创建支付客户（201·资源创建语义经 successStatus CREATED 承接）。
   * @returns 归一化客户引用。
   */
  @Impl(paymentCreateCustomerContract)
  createCustomer() {
    return os
      .input(createCustomerSchema)
      .output(paymentCustomerRefSchema)
      .meta(paymentCreateCustomerMeta)
      .handler(({ input }) => this.payment.createCustomer(input));
  }

  /**
   * 创建结账（收款意图·201·无效 400 经 WP-D 承接）。
   * @returns 归一化结账引用。
   */
  @Impl(paymentCreateCheckoutContract)
  createCheckout() {
    return os
      .input(createCheckoutSchema)
      .output(paymentCheckoutRefSchema)
      .meta(paymentCreateCheckoutMeta)
      .handler(({ input }) => this.payment.createCheckout(input));
  }

  /**
   * 按 id 取回结账（未命中 404 经 WP-D 承接）。
   * @returns 归一化结账引用。
   */
  @Impl(paymentRetrieveCheckoutContract)
  retrieveCheckout() {
    return os
      .input(paymentCheckoutIdParamSchema)
      .output(paymentCheckoutRefSchema)
      .meta(paymentRetrieveCheckoutMeta)
      .handler(({ input }) => this.payment.retrieveCheckout(input.id));
  }

  /**
   * 对结账退款（201·无效 400 经 WP-D 承接）。
   * @returns 归一化退款引用。
   */
  @Impl(paymentRefundContract)
  refund() {
    return os
      .input(refundPaymentSchema)
      .output(paymentRefundRefSchema)
      .meta(paymentRefundMeta)
      .handler(({ input }) => this.payment.refund(input));
  }

  /**
   * 处理支付 Webhook 事件（靠通道签名校验而非会话）。
   *
   * @remarks
   * **carve-out（保留 REST）**：需 `request.rawBody` 原始字节做签名校验·传输特化入口·见类注。
   * @param request - 携 rawBody 的原始请求。
   * @param signature - `stripe-signature` 头。
   * @returns 已接收 ack（`{ received: true }`）。
   */
  @Post('payment/webhooks')
  // 入站回调 ack 非新建资源·运行时对齐 OpenAPI 文档 200（PSP 期望 2xx·REST 一致性核验片·项③）。
  @HttpCode(HttpStatus.OK)
  // 入站回调靠 Stripe 签名校验而非会话·S11 显式旁路全局会话墙（deny-by-default 下的例外）。
  @Public()
  @SerializeOptions({ schema: webhookAckSchema })
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

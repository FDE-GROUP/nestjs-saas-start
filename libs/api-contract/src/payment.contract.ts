/**
 * payment 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 状态 / 客户 / 结账（创建·取回）/ 退款五面。`@Impl` 恒施加 `HttpCode(successStatus)`（默认 200），
 * 资源创建三面显式 `successStatus: 201`（承 `HttpStatus.CREATED`·复原旧 POST 201 语义·REST 一致性）。
 * **webhook 保留 REST**（靠 `request.rawBody` 原始字节做 Stripe 签名校验·传输特化入口·plan §2-1）——
 * 不在本契约面。守卫（TenantIsolationExempt+全局 SessionGuard）/handler 留 apps/api。
 */
import {
  createCheckoutSchema,
  createCustomerSchema,
  paymentCheckoutIdParamSchema,
  paymentCheckoutRefSchema,
  paymentCustomerRefSchema,
  paymentRefundRefSchema,
  paymentStatusSchema,
  refundPaymentSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const paymentTestMeta = openapi({
  method: 'GET',
  path: '/payment/test',
  summary: 'Payment integration status',
});
export const paymentCreateCustomerMeta = openapi({
  method: 'POST',
  path: '/payment/customers',
  successStatus: 201,
  summary: 'Create a payment customer',
});
export const paymentCreateCheckoutMeta = openapi({
  method: 'POST',
  path: '/payment/checkouts',
  successStatus: 201,
  summary: 'Create a checkout (payment intent)',
});
export const paymentRetrieveCheckoutMeta = openapi({
  method: 'GET',
  path: '/payment/checkouts/:id',
  summary: 'Retrieve a checkout',
});
export const paymentRefundMeta = openapi({
  method: 'POST',
  path: '/payment/refunds',
  successStatus: 201,
  summary: 'Refund a checkout',
});

export const paymentTestContract = oc.output(paymentStatusSchema).meta(paymentTestMeta);
export const paymentCreateCustomerContract = oc
  .input(createCustomerSchema)
  .output(paymentCustomerRefSchema)
  .meta(paymentCreateCustomerMeta);
export const paymentCreateCheckoutContract = oc
  .input(createCheckoutSchema)
  .output(paymentCheckoutRefSchema)
  .meta(paymentCreateCheckoutMeta);
export const paymentRetrieveCheckoutContract = oc
  .input(paymentCheckoutIdParamSchema)
  .output(paymentCheckoutRefSchema)
  .meta(paymentRetrieveCheckoutMeta);
export const paymentRefundContract = oc
  .input(refundPaymentSchema)
  .output(paymentRefundRefSchema)
  .meta(paymentRefundMeta);

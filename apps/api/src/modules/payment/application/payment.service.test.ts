import type { ConfigService } from '@app/config/config.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentProvider, PaymentProviderId } from '../domain/ports/payment-provider.port';
import { PaymentService } from './payment.service';

/**
 * 支付门面选择/降级单测（module-test-coverage-gaps G1·追溯对拍拓出 payment 面零测）。
 *
 * 锁 `PaymentService.resolve()` 三态真实分支 + 懒解析降级（构造不校验·仅调用时无通道才 503·
 * NFR-2 未配即降级）：
 *  - wanted 已注册 → 用之（不触其它 provider）；
 *  - wanted 未注册 → 回落 `providers.stripe`（`?? providers.stripe`）；
 *  - 无任何 provider → 抛 `ServiceUnavailableException` + `BILLING_PROVIDER_NOT_CONFIGURED`；
 *  - `describe()` 概览不抛错（即便 providers 空）；`supportsRecurring()` 委派所选 provider。
 * 全 DB-free：providers 以桩替真 SDK（Stripe/alipay 不打网络）。
 */

function fakeProvider(id: PaymentProviderId): PaymentProvider {
  return {
    id,
    supportsRecurring: vi.fn().mockReturnValue(id === 'stripe'),
    createCustomer: vi
      .fn()
      .mockResolvedValue({ id: `cus_${id}`, providerId: id, email: 'e@x.io', raw: {} }),
    createCheckout: vi.fn().mockResolvedValue({ id: `co_${id}`, providerId: id, raw: {} }),
    retrieveCheckout: vi.fn().mockResolvedValue({ id: `co_${id}`, providerId: id, raw: {} }),
    refund: vi.fn().mockResolvedValue({ id: `rf_${id}`, providerId: id, raw: {} }),
    verifyWebhook: vi.fn().mockResolvedValue({ providerId: id, type: 'x', data: {}, raw: {} }),
  };
}

function makeService(provider: PaymentProviderId, providers: Record<string, PaymentProvider>) {
  const config = { getPaymentConfig: () => ({ provider }) } as unknown as ConfigService;
  return new PaymentService(config, providers);
}

describe('PaymentService.resolve 选择/降级（G1）', () => {
  it('wanted 已注册 → 委派该 provider，不触其它通道', async () => {
    const stripe = fakeProvider('stripe');
    const alipay = fakeProvider('alipay');
    const svc = makeService('alipay', { stripe, alipay });

    await svc.createCustomer({ email: 'e@x.io' });

    expect(alipay.createCustomer).toHaveBeenCalledTimes(1);
    expect(stripe.createCustomer).not.toHaveBeenCalled();
  });

  it('wanted 未注册 → 回落 stripe（`?? providers.stripe`）', async () => {
    const stripe = fakeProvider('stripe');
    const svc = makeService('alipay', { stripe }); // alipay 不在注册表

    await svc.createCustomer({ email: 'e@x.io' });

    expect(stripe.createCustomer).toHaveBeenCalledTimes(1);
  });

  it('无任何 provider（含 wanted=stripe 但表空）→ 503 + BILLING_PROVIDER_NOT_CONFIGURED', async () => {
    const svc = makeService('stripe', {});

    expect.assertions(3);
    try {
      await svc.createCustomer({ email: 'e@x.io' });
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceUnavailableException);
      const res = (e as ServiceUnavailableException).getResponse() as Record<string, unknown>;
      expect(res.errorCode).toBe(ERROR_CODES.BILLING_PROVIDER_NOT_CONFIGURED);
      expect(res.statusCode).toBe(503);
    }
  });
});

describe('PaymentService.describe / supportsRecurring（G1）', () => {
  it('describe 返 {selected, available}·不抛错（即便空注册表）', () => {
    const svc = makeService('alipay', {
      stripe: fakeProvider('stripe'),
      alipay: fakeProvider('alipay'),
    });
    expect(svc.describe()).toEqual({ selected: 'alipay', available: ['stripe', 'alipay'] });

    const empty = makeService('stripe', {});
    expect(() => empty.describe()).not.toThrow();
    expect(empty.describe()).toEqual({ selected: 'stripe', available: [] });
  });

  it('supportsRecurring 委派所选 provider 的能力门', () => {
    const alipay = fakeProvider('alipay');
    expect(makeService('alipay', { alipay }).supportsRecurring()).toBe(false);
    expect(alipay.supportsRecurring).toHaveBeenCalled();

    const stripe = fakeProvider('stripe');
    expect(makeService('stripe', { stripe }).supportsRecurring()).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { selectPaymentProvider } from './provider-selection.policy';

/**
 * 支付通道选择/降级策略纯单测（domain 零框架依赖）。
 * 锁 `providers[wanted] ?? providers.stripe` 三分支；返回 undefined 表示无可用通道，
 * 由 application 层映射为 503（迁移前 `resolve()` 语义）。
 */
describe('selectPaymentProvider（domain 策略）', () => {
  const stripe = { id: 'stripe' };
  const alipay = { id: 'alipay' };

  it('wanted 已注册 → 用之', () => {
    expect(selectPaymentProvider({ stripe, alipay }, 'alipay')).toBe(alipay);
  });

  it('wanted 未注册 → 回落 stripe', () => {
    expect(selectPaymentProvider({ stripe }, 'alipay')).toBe(stripe);
  });

  it('无任何 provider → undefined（交由 application 抛 503）', () => {
    expect(selectPaymentProvider({}, 'stripe')).toBeUndefined();
  });
});

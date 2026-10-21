import { describe, expect, it } from 'vitest';
import { Money } from './money';

/**
 * Money 值对象纯单测（domain 零框架依赖·result-union）。
 * 锁不变量刻意与边界 zod `createCheckoutSchema` 对齐：amount 有限且 ≥ 1、currency 非空；
 * 不收紧为整数/ISO 三位码（fractional amount 应放行）。
 */
describe('Money.fromMinorUnits（domain 值对象）', () => {
  it('合法金额+币种 → ok 且持值', () => {
    const r = Money.fromMinorUnits(2000, 'usd');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.money.amount).toBe(2000);
      expect(r.money.currency).toBe('usd');
    }
  });

  it('amount < 1 → 拒（reason=amount）', () => {
    expect(Money.fromMinorUnits(0, 'usd')).toEqual({ ok: false, reason: 'amount' });
  });

  it('amount NaN / Infinity → 拒', () => {
    expect(Money.fromMinorUnits(Number.NaN, 'usd')).toEqual({ ok: false, reason: 'amount' });
    expect(Money.fromMinorUnits(Number.POSITIVE_INFINITY, 'usd')).toEqual({
      ok: false,
      reason: 'amount',
    });
  });

  it('currency 空串 → 拒（reason=currency）', () => {
    expect(Money.fromMinorUnits(100, '')).toEqual({ ok: false, reason: 'currency' });
  });

  it('fractional amount 放行（对齐 zod·不收紧为整数）', () => {
    expect(Money.fromMinorUnits(2000.5, 'usd').ok).toBe(true);
  });
});

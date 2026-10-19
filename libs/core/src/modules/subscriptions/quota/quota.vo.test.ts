import { describe, expect, it } from 'vitest';
import { Quota } from './quota.vo';

/** 架构精度修宪 S2 · P2：Quota VO 不变量（非负安全整数）+ 原生 Error fail-loud（非框架异常）。 */
describe('Quota VO（P2 不变量）', () => {
  it('accepts non-negative integers (0 is a legal quota)', () => {
    expect(Quota.of(0).value).toBe(0);
    expect(Quota.of(5).value).toBe(5);
    expect(Quota.of(Number.MAX_SAFE_INTEGER).value).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('fails loud with a plain Error (非框架异常·P1) on negatives, fractions, NaN, Infinity', () => {
    for (const bad of [-1, -0.0001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.EPSILON]) {
      expect(() => Quota.of(bad)).toThrow(Error);
      expect(() => Quota.of(bad)).toThrow(/非负安全整数/);
    }
  });

  it('equates by value（不可变性由 TS readonly 编译期承载·纪律性非运行时强锁）', () => {
    const a = Quota.of(7);
    const b = Quota.of(7);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(Quota.of(8))).toBe(false);
  });
});

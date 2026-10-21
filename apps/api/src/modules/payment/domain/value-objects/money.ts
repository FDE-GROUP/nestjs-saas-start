/**
 * Money 值对象（真实领域逻辑·不可变·纯函数·result-union）。
 *
 * 从 `CreateCheckoutInput` 的 `amount`（最小货币单位）+ `currency` 提炼。不变量刻意与
 * 边界 zod `createCheckoutSchema` 对齐（amount 有限且 ≥ 1、currency 非空），**不额外收紧为
 * 整数 / ISO-4217 三位码**——收紧会拒收当前 zod 放行的输入，改变 HTTP 接受面（边界 schema 才是
 * 校验单源）。本 VO 的价值在于给「金额+币种」一个具名、不可变、构造即守的领域概念。
 */
export type MoneyRejection = 'amount' | 'currency';

export type MoneyResult = { ok: true; money: Money } | { ok: false; reason: MoneyRejection };

export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  static fromMinorUnits(amount: number, currency: string): MoneyResult {
    if (!Number.isFinite(amount) || amount < 1) {
      return { ok: false, reason: 'amount' };
    }
    if (!currency || currency.length < 1) {
      return { ok: false, reason: 'currency' };
    }
    return { ok: true, money: new Money(amount, currency) };
  }
}

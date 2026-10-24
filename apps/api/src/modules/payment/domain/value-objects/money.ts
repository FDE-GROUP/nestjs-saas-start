/**
 * `Money.fromMinorUnits` 构造失败的拒绝原因联合。
 * @public
 */
export type MoneyRejection = 'amount' | 'currency';

/**
 * `Money` 构造的结果联合（ok / 拒绝原因·result-union 口径）。
 * @public
 */
export type MoneyResult = { ok: true; money: Money } | { ok: false; reason: MoneyRejection };

/**
 * Money 值对象（真实领域逻辑·不可变·纯函数·result-union）。
 *
 * @remarks
 * 从 `CreateCheckoutInput` 的 `amount`（最小货币单位）+ `currency` 提炼。不变量刻意与
 * 边界 zod `createCheckoutSchema` 对齐（amount 有限且 ≥ 1、currency 非空），**不额外收紧为
 * 整数 / ISO-4217 三位码**——收紧会拒收当前 zod 放行的输入，改变 HTTP 接受面（边界 schema 才是
 * 校验单源）。本 VO 的价值在于给「金额+币种」一个具名、不可变、构造即守的领域概念。
 * @public
 */
export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  /**
   * 从最小货币单位金额 + 币种构造 Money（构造即守不变量）。
   * @param amount - 最小货币单位金额（如分）。
   * @param currency - ISO 货币码。
   * @returns 成功含 `Money`、失败含拒绝原因的 `MoneyResult`。
   */
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

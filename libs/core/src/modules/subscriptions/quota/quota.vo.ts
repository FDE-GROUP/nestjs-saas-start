/**
 * 配额值对象（架构精度修宪 S2 · P2「值对象按需」本域唯一认定）：不变量 = **非负安全整数**。
 *
 * 违约以**原生 Error** fail-loud（P1 纯度硬约束：内核/kit 不抛框架异常——HTTP 翻译归
 * 适配器角色文件，见 QuotaGuard）。落点：档位目录（tenant-plans）、生效限额裁决
 * （QuotaService.effectiveSeatsLimit）、订阅写路径摄入（create-subscription）。
 * 存储与线上（wire）形状仍是 number——VO 只在 kit 内部承载不变量，出边界即 `.value`。
 */
export class Quota {
  private constructor(readonly value: number) {}

  /** 唯一构造口：非负安全整数之外一律 fail-loud（含 NaN/Infinity/小数/负数）。 */
  static of(raw: number): Quota {
    if (!Number.isSafeInteger(raw) || raw < 0) {
      throw new Error(`Quota: 非法配额值 ${String(raw)}（须为非负安全整数）`);
    }
    return new Quota(raw);
  }

  equals(other: Quota): boolean {
    return this.value === other.value;
  }
}

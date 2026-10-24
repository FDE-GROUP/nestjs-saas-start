import { randomBytes } from 'node:crypto';

/**
 * 生成 UUIDv7（RFC 9562 §4.2.3）——应用生成 id 的**唯一时间序形态**。
 *
 * @remarks
 * module-es-first-real-consumer 附带机制统一：人裁 2026-10-17「时间戳在高位、按字节排序≈按时间排序」。
 *
 * 布局：`unix_ts_ms`(48bit 大端) | `ver`=7(4bit) | `rand_a`(12bit) | `variant`=10(2bit) | `rand_b`(62bit)。
 * 同毫秒内以随机位去重（RFC 允许·非严格单调计数）；跨毫秒按字典序≈时间序，可直接作
 * 「最新行」排序键（免 createdAt tiebreaker）。
 *
 * 运行核实证：Node 22 无原生 `crypto.v7id`（Node 24+ 才有），故零依赖手写；升级基线后可切换原生。
 *
 * @returns 定宽小写 hex 的 UUIDv7 串
 * @public
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  // 高 48 bit 盖 unix_ms（当前纪元值 < 2^48·writeUIntBE 直接容下；切勿用位掩码——JS 位运算截 32bit）
  bytes.writeUIntBE(Date.now(), 0, 6);
  // byte6: 高 nibble=version 7，低 nibble 保留随机（rand_a）
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  // byte8: variant 10xx，余 6 bit 保留随机（rand_b）
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

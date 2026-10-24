/**
 * 支付通道选择与降级策略（真实领域规则·纯函数）。
 *
 * @remarks
 * 从 `PaymentService.resolve()` 提取：优先用配置指定通道，未注册则回落 `stripe`
 * （`providers[wanted] ?? providers.stripe`）。返回 `undefined` 表示无任何可用通道，
 * 由 `application` 层映射为 `ServiceUnavailableException`（保持懒解析「未配不炸启动」语义）。
 * @param providers - 已注册通道集（provider id → 实例）。
 * @param wanted - 配置期望的通道 id。
 * @returns 命中的通道实例；无可用则为 `undefined`。
 * @public
 */
export function selectPaymentProvider<T>(
  providers: Record<string, T>,
  wanted: string,
): T | undefined {
  return providers[wanted] ?? providers.stripe;
}

/**
 * 存储通道选择与降级策略（真实领域规则·纯函数）。
 *
 * @remarks
 * 从 `StorageService` 构造期提取：优先用配置指定的 provider，未注册则回落 `s3`
 * （`StorageModule.register()` 始终注册 `s3`，故回落恒可用）。
 * 泛型 + 零框架依赖，仅表达「选哪个通道」的裁决。
 * @param providers - 已注册通道集（provider id → 实例）。
 * @param requested - 配置期望的通道 id。
 * @param fallbackKey - 回落通道键；缺省 `s3`。
 * @returns 命中的通道实例（期望未注册时为回落实例）。
 * @public
 */
export function selectStorageProvider<T>(
  providers: Record<string, T>,
  requested: string,
  fallbackKey = 's3',
): T {
  return (providers[requested] ?? providers[fallbackKey]) as T;
}

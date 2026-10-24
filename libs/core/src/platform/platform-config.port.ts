/**
 * 平台配置端口的 DI 注入 token（global-tenancy §9.5.3 热点③ / §9.5.4①B · P1c 配置端口）。
 *
 * @remarks
 * tenancy core（`PlatformOperatorGuard`）需要「全局唯一 Platform Operator 的 email」这一平台配置，
 * 但**不得** import 应用侧 `@app/config` 的具体 `ConfigService`。核心只消费本端口，具体 env 加载
 * 由参考应用侧适配（`infrastructure/config-platform.settings`·包 `ConfigService.getPlatformConfig`）提供。
 *
 * @public
 */
export const PLATFORM_SETTINGS = Symbol('PLATFORM_SETTINGS');

/**
 * 平台配置读取端口：向 core 暴露平台级配置项（不含具体 env 加载实现）。
 *
 * @public
 */
export interface PlatformSettings {
  /**
   * 平台经营者 email（未配置 → undefined·守卫据此 fail-closed）。
   *
   * @returns 已配置的经营者 email；缺配返回 `undefined`
   */
  operatorEmail(): string | undefined;
}

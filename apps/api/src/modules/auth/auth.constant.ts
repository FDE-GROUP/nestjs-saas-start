/**
 * Better Auth 实例的 DI 注入 token。
 * @public
 */
export const AuthInstanceInjectKey = Symbol('AuthInstance');

/**
 * OAuth 社交登录通道类型枚举（值=各通道标识串）。
 * @public
 */
export enum OAuthProviderType {
  GITHUB = 'github',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  TWITTER = 'twitter',
  MICROSOFT = 'microsoft',
  DISCORD = 'discord',
  APPLE = 'apple',
  LINKEDIN = 'linkedin',
  GITLAB = 'gitlab',
  SPOTIFY = 'spotify',
  TWITCH = 'twitch',
  REDDIT = 'reddit',
  DROPBOX = 'dropbox',
  TIKTOK = 'tiktok',
  KICK = 'kick',
  ROBLOX = 'roblox',
  VK = 'vk',
}

/**
 * 会话旁路路径表（module-auth-http-surface·丙清算）：原 `AuthMiddleware` 消费面已随接线退役，
 * 现唯一消费方 = `AuthSessionReader` 廉价旁路（免无意义会话查询）。
 *
 * @internal
 */
export const AUTH_BYPASS_PATHS = [
  // 存活探针（module-common-health-probe）：与 Dockerfile HEALTHCHECK 的 /api/v1/health 口径对齐
  '/health',
  '/apidoc',
  '/openapi.yaml',
  '/openapi.json',
];

/**
 * Better Auth HTTP 面挂载段（module-tenancy-session-path-match）：锚定 `auth.implement` basePath
 * `/${apiPrefix}/v1/auth`。AuthSessionReader 廉价旁路据此做**完整路径段对齐**匹配（勿用子串
 * `includes`——会误撞 `/authors` 等含 `auth` 子串的业务路由）。
 * @public
 */
export const AUTH_SURFACE_PATH = '/auth';

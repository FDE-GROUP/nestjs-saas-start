import { OAuthProviderType } from '../auth.constant';

/**
 * 社交渠道注册裁决（module-config-env-surface-contract 切片 A · 共同底线）：
 * 把原先散在 `buildSocialProviders()` 里的**三条静默 `continue` 分支**抽成纯函数，
 * 使「启用了却没注册」这件事在 boot 期就可见——F3 的实机存照证明：宪法/README 承诺保留
 * Google，`oauth-guide` 还教用户写 `OAUTH_PROVIDERS=github,google`，而 `envs/default.ts`
 * 缺 `google` 槽位时被跳过，本仓代码一行日志都不给（只有用户真去点登录才由 BA 报一条
 * 措辞误导的 `Provider not found`，把人引向改 `OAUTH_PROVIDERS`）。
 *
 * 纪律：机制单点修，不逐渠道特判；判定与措辞在此集中，装配层只负责 warn / 拒启。
 */
export type ProviderDropReason = 'unknown-type' | 'no-config-slot' | 'missing-credentials';

export interface ProviderDrop {
  /** `OAUTH_PROVIDERS` 里声明的渠道名（原样保留大小写，便于定位配置行）。 */
  type: string;
  reason: ProviderDropReason;
}

export interface RegisteredProvider {
  type: string;
  clientId: string;
  clientSecret: string;
  /** 除凭证外的透传项（如 scope / pkce 等）。 */
  extras: Record<string, string>;
}

export interface SocialProviderRegistration {
  registered: RegisteredProvider[];
  drops: ProviderDrop[];
}

const KNOWN_PROVIDER_TYPES = Object.values(OAuthProviderType) as string[];

/**
 * 依「声明启用」的渠道列表与 `oauth.secrets` 槽位表裁决出可注册集合与被放弃集合。
 * 纯函数：不读 env、不打日志、不抛错——由调用方按 `planProviderDiagnostics` 决定强度。
 */
export function resolveSocialProviders(
  enabledTypes: string[],
  secrets: Record<string, Record<string, string>>,
): SocialProviderRegistration {
  const registered: RegisteredProvider[] = [];
  const drops: ProviderDrop[] = [];

  for (const type of enabledTypes) {
    if (!KNOWN_PROVIDER_TYPES.includes(type)) {
      drops.push({ type, reason: 'unknown-type' });
      continue;
    }
    const config = secrets[type];
    if (!config) {
      drops.push({ type, reason: 'no-config-slot' });
      continue;
    }
    if (!config.clientId || !config.clientSecret) {
      drops.push({ type, reason: 'missing-credentials' });
      continue;
    }
    const { clientId, clientSecret, ...extras } = config;
    registered.push({ type, clientId, clientSecret, extras });
  }

  return { registered, drops };
}

export interface ProviderDiagnosticsPlan {
  /** `throw` = 生产拒启（fail-loud）；`warn` = 非生产告警；`silent` = 无被弃渠道。 */
  mode: 'throw' | 'warn' | 'silent';
  message: string;
}

const DROP_HINTS: Record<ProviderDropReason, string> = {
  'unknown-type':
    '不是 Better Auth 支持的 social provider（见 auth.constant.ts 的 OAuthProviderType）——拼错渠道名或该渠道未实现；境内渠道请改走 OAUTH_GENERIC_PROVIDERS',
  'no-config-slot':
    '已在 OAUTH_PROVIDERS 中启用，但 config/envs/default.ts 的 oauth.secrets 无此渠道槽位——**光在 .env 里放 *_CLIENT_ID / *_CLIENT_SECRET 不会生效**，请补槽位或从 OAUTH_PROVIDERS 移除该渠道',
  'missing-credentials':
    '有配置槽位但 clientId / clientSecret 为空——请补对应环境变量，或从 OAUTH_PROVIDERS 移除该渠道',
};

/** 把被弃渠道汇成一条自述真因的诊断文案（含数量与逐条清单）。 */
export function formatProviderDiagnostics(drops: ProviderDrop[]): string {
  const lines = drops.map((d) => `  - ${d.type}：${DROP_HINTS[d.reason]}`);
  return [
    `${drops.length} 个已启用的 OAuth 社交渠道未被注册（不会出现在登录面），逐条原因：`,
    ...lines,
  ].join('\n');
}

/**
 * 强度裁决（人裁「非生产 warn + 生产 fail-loud」）：生产下配置错位属**必修缺陷**，
 * 静默降级会让人以为渠道已接线；非生产给一条可定位的 warn 不打断开发。
 */
export function planProviderDiagnostics(
  drops: ProviderDrop[],
  isProduction: boolean,
): ProviderDiagnosticsPlan {
  if (drops.length === 0) {
    return { mode: 'silent', message: '' };
  }
  const message = formatProviderDiagnostics(drops);
  return { mode: isProduction ? 'throw' : 'warn', message };
}

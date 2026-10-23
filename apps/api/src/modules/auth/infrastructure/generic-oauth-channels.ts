import type { GenericOAuthConfig } from 'better-auth/plugins';

/**
 * 境内登录渠道 · Better Auth `genericOAuth` 配置构建（FR-3 · 方案 C · A1）。
 *
 * 「邮箱为体、社交为用」：境内渠道**不独立建号**（`disableSignUp: true`），
 * 仅作为既有 email user 的登录 / 绑定方式；各渠道以不可变主体键 `accountSubject`
 * 落一条 `account` 关联到同一 user（复用现有 `account` 表，无需 schema 变更）。
 *
 * D8 交付排序：**本期仅飞书提供构建器**；`wechat` / `dingtalk` / `wecom` 为**接口位**
 * （登记于 `KNOWN_GENERIC_CHANNELS`，未落地构建器即被 `buildGenericOAuthConfigs` 跳过，
 * NFR-1 可插拔 / NFR-2 未配即降级）。端点/字段依飞书开放平台官方文档核验（plan §11-4）。
 */

export type GenericChannelId = 'feishu' | 'wechat' | 'dingtalk' | 'wecom';

/** 已知境内渠道（接口位登记；实际是否可用取决于是否提供构建器 + 凭证）。 */
export const KNOWN_GENERIC_CHANNELS: readonly GenericChannelId[] = [
  'feishu',
  'wechat',
  'dingtalk',
  'wecom',
];

interface ChannelSecrets {
  clientId: string;
  clientSecret: string;
}

// —— 飞书 / Lark 端点（官方文档核验，2026-10-13）——
const FEISHU_AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const FEISHU_USERINFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
// 基础用户信息 scope；不含 email（方案 C 下 email 源自注册账号，非渠道返回）。
const FEISHU_SCOPES = ['contact:user.base:readonly'];

function buildFeishu(secrets: ChannelSecrets): GenericOAuthConfig {
  return {
    providerId: 'feishu',
    authorizationUrl: FEISHU_AUTHORIZE_URL,
    tokenUrl: FEISHU_TOKEN_URL,
    userInfoUrl: FEISHU_USERINFO_URL,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    scopes: FEISHU_SCOPES,
    // 飞书 v2 token 端点为 JSON body、client_secret 入 body（非 form、非 Basic）→ 自定义换取。
    getToken: async ({ code, redirectURI }) => {
      const res = await fetch(FEISHU_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: secrets.clientId,
          client_secret: secrets.clientSecret,
          code,
          redirect_uri: redirectURI,
        }),
      });
      const data = (await res.json()) as Record<string, any>;
      if (data.code !== 0 || !data.access_token) {
        throw new Error(`Feishu token exchange failed: code=${data.code} ${data.error ?? ''}`);
      }
      return {
        accessToken: data.access_token as string,
        refreshToken: data.refresh_token as string | undefined,
        tokenType: (data.token_type as string) ?? 'Bearer',
        accessTokenExpiresAt: data.expires_in
          ? new Date(Date.now() + Number(data.expires_in) * 1000)
          : undefined,
        refreshTokenExpiresAt: data.refresh_token_expires_in
          ? new Date(Date.now() + Number(data.refresh_token_expires_in) * 1000)
          : undefined,
        scopes: typeof data.scope === 'string' ? (data.scope as string).split(' ') : undefined,
        raw: data,
      };
    },
    // 飞书 userinfo 响应体嵌套在 `data` 下、以 Bearer user_access_token 获取 → 自定义解包。
    getUserInfo: async (tokens) => {
      const res = await fetch(FEISHU_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
      });
      const body = (await res.json()) as Record<string, any>;
      if (body.code !== 0 || !body.data) {
        throw new Error(`Feishu userinfo fetch failed: code=${body.code} ${body.msg ?? ''}`);
      }
      // 解包 data 并补 GenericOAuthUserInfo 必填的 emailVerified（渠道不报验证态）。
      return { ...body.data, emailVerified: false };
    },
    // 不可变主体键：优先 union_id（跨应用稳定），回退 open_id。Better Auth 运行期不改写字段。
    accountSubject: ({ profile }) =>
      String(profile.union_id ?? profile.open_id ?? profile.user_id ?? ''),
    mapProfileToUser: (profile) => ({
      name: (profile.name as string) ?? undefined,
      email: (profile.email as string) ?? null,
      image: (profile.avatar_thumb as string) ?? (profile.avatar_url as string) ?? undefined,
      emailVerified: false,
    }),
    // 方案 C：社交渠道不独立建号——首登无匹配账号即拒绝，须先以 email 登录后绑定。
    disableSignUp: true,
    // 飞书授权码流程不支持标准 PKCE；显式关闭。
    pkce: false,
  };
}

/** 渠道构建器登记表；未列入者（wechat/dingtalk/wecom）视为暂缓的接口位。 */
const CHANNEL_BUILDERS: Partial<
  Record<GenericChannelId, (s: ChannelSecrets) => GenericOAuthConfig>
> = {
  feishu: buildFeishu,
  // wechat: 待补（getToken 走 GET、errcode 判定、mapProfile、accountSubject=unionid）
  // dingtalk: 待补（token POST JSON、userinfo 自定义头、accountSubject=unionId）
  // wecom: 待补（服务端 corp access_token 换取编排，难度最高）
};

/**
 * 依启用列表 + 凭证装配 `genericOAuth` 配置数组。
 * 跳过条件（NFR-2 未配即降级）：渠道未提供构建器、或缺 clientId/clientSecret。
 */
export function buildGenericOAuthConfigs(
  genericProviders: readonly string[],
  secrets: Record<string, Record<string, string>>,
): GenericOAuthConfig[] {
  return resolveGenericChannels(genericProviders, secrets).configs;
}

/**
 * 未注册归因（module-config-env-surface-contract 切片 A 的对称半边）：旧写法这里也是两条静默
 * `continue`，与 social 面同构。本片只补**可见化**，不改启动语义——`.env.example` 对 generic 面
 * 明示「未列即不注册（不配凭证可正常启动）」，且 D8/NFR-2「未配即降级」为既有人裁，
 * 因此强度取「一律 warn（含生产）」；是否升级为生产 fail-loud 已登记归人。
 */
export type GenericChannelDropReason = 'unknown-id' | 'builder-pending' | 'missing-credentials';

export interface GenericChannelDrop {
  /** `OAUTH_GENERIC_PROVIDERS` 里声明的 providerId（原样保留，便于定位配置行）。 */
  id: string;
  reason: GenericChannelDropReason;
}

export interface GenericChannelResolution {
  configs: GenericOAuthConfig[];
  drops: GenericChannelDrop[];
}

type ClassifiedChannel = { id: string; config: GenericOAuthConfig } | GenericChannelDrop;

/** 单渠道裁决：social 面与 generic 面共用同一「已声明但未注册必须归因」口径。 */
function classifyGenericChannel(
  rawId: string,
  secrets: Record<string, Record<string, string>>,
): ClassifiedChannel {
  if (!(KNOWN_GENERIC_CHANNELS as readonly string[]).includes(rawId)) {
    return { id: rawId, reason: 'unknown-id' };
  }
  const id = rawId as GenericChannelId;
  const builder = CHANNEL_BUILDERS[id];
  if (!builder) {
    return { id, reason: 'builder-pending' };
  }
  const secret = secrets[id];
  if (!secret?.clientId || !secret?.clientSecret) {
    return { id, reason: 'missing-credentials' };
  }
  return { id, config: builder({ clientId: secret.clientId, clientSecret: secret.clientSecret }) };
}

/** 一次遍历同时得出可注册配置与被弃清单（避免两处判定条件漂移）。 */
export function resolveGenericChannels(
  genericProviders: readonly string[],
  secrets: Record<string, Record<string, string>>,
): GenericChannelResolution {
  const configs: GenericOAuthConfig[] = [];
  const drops: GenericChannelDrop[] = [];
  for (const rawId of genericProviders) {
    const result = classifyGenericChannel(rawId, secrets ?? {});
    if ('config' in result) configs.push(result.config);
    else drops.push(result);
  }
  return { configs, drops };
}

const GENERIC_DROP_HINTS: Record<GenericChannelDropReason, string> = {
  'unknown-id': '不在 KNOWN_GENERIC_CHANNELS 登记面内——拼错 providerId 或该渠道不属境内设计范围',
  'builder-pending':
    '系 D8 登记的**接口位**（wechat / dingtalk / wecom 实现劣后暂缓），本期无构建器——列入 OAUTH_GENERIC_PROVIDERS 也不会注册，请勿在此启用',
  'missing-credentials':
    '已实现但 secrets 的 clientId / clientSecret 为空——按 NFR-2「未配即降级」不注册（该渠道不会出现在登录面），可正常启动',
};

/** 汇成一条自述真因的诊断文案（供 boot 期 warn）。 */
export function formatGenericChannelDiagnostics(drops: GenericChannelDrop[]): string {
  const lines = drops.map((d) => `  - ${d.id}：${GENERIC_DROP_HINTS[d.reason]}`);
  return [
    `${drops.length} 个已声明的境内 OAuth 渠道（OAUTH_GENERIC_PROVIDERS）未被注册，逐条原因：`,
    ...lines,
  ].join('\n');
}

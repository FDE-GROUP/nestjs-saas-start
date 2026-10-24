import { parseCorsOrigins } from './cors-origins';
import { parseSsoClients } from './sso-clients';

export default {
  app: {
    name: process.env.APP_NAME || 'NestJS SaaS Start',
    description: process.env.APP_DESCRIPTION || 'NestJS template with best practices',
    version: process.env.API_VERSION || '1.0',
    port: parseInt(process.env.PORT || '7009', 10),
    host: process.env.HOST || 'localhost',
    apiPrefix: process.env.API_PREFIX || 'api',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nestjs_practice',
  },
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET || 'your-secret-key',
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
    },
    betterAuth: {
      allowed_origins: (process.env.ALLOWED_ORIGINS ?? '').split(', '),
    },
  },
  cors: {
    enabled: true,
    // 单一白名单源（ALLOWED_ORIGINS·逗号分隔完整 origin）；空则 []，main.ts 函数式回显兼容凭证。
    origin: parseCorsOrigins(process.env.ALLOWED_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },
  swagger: {
    enabled: true,
    title: 'NestJS SaaS Start API',
    description: 'NestJS SaaS Start API documentation',
    version: process.env.API_DOC_VERSION || '1.0.0',
    path: 'apidoc',
    openApiVersion: process.env.OPEN_API_VERSION || '3.1.0',
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'alioss',
    bucket: process.env.STORAGE_BUCKET || 'my-bucket',
    region: process.env.STORAGE_REGION || 'oss-cn-hangzhou',
    endpoint: process.env.STORAGE_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    accessKeySecret: process.env.STORAGE_ACCESS_KEY_SECRET,
    baseUrl: process.env.STORAGE_BASE_URL || '',
    maxFileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760', 10), // Default 10MB
    allowedMimeTypes: (
      process.env.STORAGE_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif,application/pdf'
    ).split(','),
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publicKey: process.env.STRIPE_PUBLIC_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    apiVersion: process.env.STRIPE_API_VERSION || '2025-02-24.acacia',
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'stripe',
  },
  // ES Phase B 后半（module-es-outbox-transactional · 裁点乙）：发布通道三模开关取代旧
  // EVENT_STORE_ENABLED 布尔；缺省 inproc 与旧「未置 true」逐字节等价（不触库）。
  // outbox 需目标库已 apply event 投递列迁移（误开 = 事务外 publishAll fail-loud）。
  eventPublish: {
    mode: (process.env.EVENT_PUBLISH_MODE || 'inproc') as 'inproc' | 'shadow' | 'outbox',
    pollMs: Number(process.env.EVENT_OUTBOX_POLL_MS || 1000),
  },
  // ES 真相源写切换（module-es-r4 §3-R4c·高危#1 逐次亲签）：缺省关（env 未置
  // ES_TRUTH_SOURCE_SUBSCRIPTIONS=true 即原路径逐字节不变·回退窗）——与 eventPublish 缺省 inproc 同保
  // DB-free/行为等价装配不变量。dev/prod envs 不重写此键，靠 @nestjs/config load 合并继承本缺省。
  // 注（global-governance-lifecycle-consolidation 切片 D）：租户治理面 ES 覆盖层（tenants 旋钮）已退役。
  esTruthSource: {
    subscriptions: process.env.ES_TRUTH_SOURCE_SUBSCRIPTIONS === 'true',
  },
  // 过期 session 回收周期任务（module-session-index-and-expiry-reclaim F2）：缺省关（env 未置 true
  // 即不启 timer·不触库）——与 eventPublish 缺省 inproc 同保 DB-free 装配不变量。
  sessionReclaim: {
    enabled: process.env.SESSION_RECLAIM_ENABLED === 'true',
    intervalMs: Number(process.env.SESSION_RECLAIM_INTERVAL_MS || 3600000),
  },
  // 平台经营者（FR-13 · S5）：全局唯一 operator 由开发者经配置设定，seed 保障其行存在；
  // 平台级动作判据 = 会话用户 email 命中此配置（泛 ADMIN 不再持有平台权）。
  platform: {
    operatorEmail: process.env.PLATFORM_OPERATOR_EMAIL || 'admin@example.com',
  },
  // SSO 身份提供方（OP）client 注册表（oauth-sso-odoo-integration 切片 B）：走 env/config 不新增 BA 表。
  // 未配 SSO_OAUTH_CLIENTS → 空数组（fail-closed·authorize 一律拒）；配置非法 → boot 期 fail-loud。
  // 仅 default.ts 定义（同 platform/esTruthSource 惯例·dev/prod envs 不覆写即继承缺省）。
  oauthSso: {
    clients: parseSsoClients(process.env.SSO_OAUTH_CLIENTS),
  },
  oauth: {
    providers: [
      ...(process.env.OAUTH_PROVIDERS || 'github').split(',').map((type) => ({
        type: type.trim(),
        enabled: true,
      })),
    ],
    // 境内 genericOAuth 渠道（方案 C）：逗号分隔的 providerId，未列即不注册（NFR-2）
    genericProviders: (process.env.OAUTH_GENERIC_PROVIDERS || '')
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean),
    // Core OAuth settings
    baseConfig: {
      callbackUrl:
        process.env.OAUTH_CALLBACK_URL_BASE || 'http://localhost:7009/api/v1/auth/callback',
      cookieName: process.env.OAUTH_COOKIE_NAME || 'auth_session',
      cookieMaxAge: parseInt(process.env.OAUTH_COOKIE_MAX_AGE || '2592000', 10), // 30 days
      cookieSecure: process.env.OAUTH_COOKIE_SECURE === 'true',
    },
    // Provider configurations
    secrets: {
      // Default demo example provider
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID || '',
        clientSecret: process.env.APPLE_CLIENT_SECRET || '',
      },
      // Google（module-config-env-surface-contract F3 · 切片 A-1）：四处宪法/README 承诺
      // 「保留 Google/GitHub」且 oauth-guide 教用户写 OAUTH_PROVIDERS=github,google，
      // 但此槽位曾不存在 ⇒ buildSocialProviders 对无槽位渠道静默跳过、渠道不可用。
      // 新增渠道必须同时在此给出槽位，否则光在 .env 里放 *_CLIENT_ID/*_CLIENT_SECRET 无效。
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
      // 飞书 / Lark（境内 genericOAuth 渠道，A1）：App ID / App Secret
      feishu: {
        clientId: process.env.FEISHU_APP_ID || '',
        clientSecret: process.env.FEISHU_APP_SECRET || '',
      },
      // more please refer to https://github.com/better-auth/better-auth
    },
  },
};

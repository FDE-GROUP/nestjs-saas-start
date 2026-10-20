export interface AppConfig {
  name: string;
  description: string;
  version: string;
  port: number;
  host: string;
  apiPrefix: string;
}

export interface AuthConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
}

export interface CorsConfig {
  enabled: boolean;
  origin: string | string[];
  credentials: boolean;
  methods: string[];
}

export interface SwaggerConfig {
  enabled: boolean;
  title: string;
  description: string;
  version: string;
  path: string;
  openApiVersion: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface StorageConfig {
  provider: 's3' | 'alioss' | 'tencentoss';
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  accessKeySecret: string;
  baseUrl?: string;
  maxFileSize: number; // use bytes
  allowedMimeTypes: string[];
}

export interface StripeConfig {
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  apiVersion: string;
}

export interface PaymentConfig {
  /** 选定的默认支付通道；未配即降级（PaymentService 使用时才报错） */
  provider: 'stripe' | 'alipay' | 'wechat_pay';
}

export interface OAuthConfig {
  providers: Array<{
    type: string;
    enabled: boolean;
  }>;
  /** 境内 genericOAuth 渠道 providerId 列表（如 'feishu'）；与标准 socialProviders 分说。 */
  genericProviders: string[];
  baseConfig: {
    callbackUrl: string;
    cookieName: string;
    cookieMaxAge: number;
    cookieSecure: boolean;
  };
  secrets: Record<string, Record<string, string>>;
}

export interface PlatformConfig {
  /** 全局唯一平台经营者 email（FR-13 · S5）；平台级守卫唯一判据。 */
  operatorEmail: string;
}

export interface Config {
  app: AppConfig;
  auth: AuthConfig;
  cors: CorsConfig;
  swagger: SwaggerConfig;
  database: DatabaseConfig;
  storage: StorageConfig;
  stripe: StripeConfig;
  payment: PaymentConfig;
  platform: PlatformConfig;
  oauth: OAuthConfig;
  eventPublish: EventPublishConfig;
  esTruthSource: EsTruthSourceConfig;
  sessionReclaim: SessionReclaimConfig;
}

/**
 * ES 真相源写切换（module-es-r1-replay-core §3-R1c / module-es-r4-second-context-subscriptions §3-R4c）：
 * 生命周期写路径是否翻为「回放即真相」（事件流为裁决输入与耐久真相·表行降为投影）。
 *  - `tenants`：缺省 false（env 未置 `ES_TRUTH_SOURCE_TENANTS=true` 即关·原路径逐字节不变）。
 *  - `subscriptions`：缺省 false（env 未置 `ES_TRUTH_SOURCE_SUBSCRIPTIONS=true` 即关）·与 tenants 正交。
 *  开启后写序：`load → fold 重放态裁决 → append(expectedVersion 乐观锁·同事务) → 投影 upsert(fold 结果)`。
 */
export interface EsTruthSourceConfig {
  tenants: boolean;
  subscriptions: boolean;
}

/**
 * ES Phase B 后半（module-es-outbox-transactional · 裁点乙）：事件发布通道三模开关，
 * 取代旧 `EVENT_STORE_ENABLED` 布尔（高危#6 随审计门签）：
 *  - `inproc`（缺省）：纯进程内派发，不触库——与旧布尔未置 true 逐字节等价；
 *  - `shadow`：耐久 append event 表后立即进程内派发（旧 `true`=影子追加语义保形）；
 *  - `outbox`：同事务 append（不立即派发），由 relay 耐久投递（at-least-once）。
 * `pollMs`：outbox relay 轮询间隔（非 outbox 模式无意义）。
 */
export type EventPublishMode = 'inproc' | 'shadow' | 'outbox';

export interface EventPublishConfig {
  mode: EventPublishMode;
  pollMs: number;
}

/**
 * module-session-index-and-expiry-reclaim F2：过期 session 回收周期任务开关（镜像 eventPublish 的
 * 「缺省不触库」纪律）：
 *  - `enabled`：缺省 false（env 未置 `SESSION_RECLAIM_ENABLED=true` 即关·保 DB-free 装配不变量）；
 *    开启方起 `setInterval` 周期 `nativeDelete(expiresAt < now)`（走 F1 `session_expires_at_idx`）。
 *  - `intervalMs`：回收轮询间隔（缺省 1h）。
 */
export interface SessionReclaimConfig {
  enabled: boolean;
  intervalMs: number;
}

import { parseCorsOrigins } from './cors-origins';

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
  },
  cors: {
    enabled: true,
    // 开发缺省放开本地前端/API 源（开箱可用）；置 ALLOWED_ORIGINS 则显式覆盖。
    origin: parseCorsOrigins(process.env.ALLOWED_ORIGINS, [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:7009',
    ]),
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
  // ES 发布通道三模开关（module-es-outbox-transactional · 裁点乙）：三层统一缺省 inproc（不触库）。
  // 旧 F5 纠偏语义延续：不写这行即关；本地要验影子追加显式 EVENT_PUBLISH_MODE=shadow，
  // 验 outbox+relay 显式置 outbox（前提：目标库已 apply 投递列·误开 = 事务外 publishAll fail-loud）。
  eventPublish: {
    mode: (process.env.EVENT_PUBLISH_MODE || 'inproc') as 'inproc' | 'shadow' | 'outbox',
    pollMs: Number(process.env.EVENT_OUTBOX_POLL_MS || 1000),
  },
};

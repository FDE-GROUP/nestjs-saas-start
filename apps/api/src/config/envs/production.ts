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
    // 生产 fail-closed：未配 ALLOWED_ORIGINS = 白名单空 = 拒所有跨源（同源反代不受影响）。
    // 跨域前端必须由运维显式登记完整 origin（逗号分隔）；main.ts 函数式回显兼容 cookie 凭证。
    origin: parseCorsOrigins(process.env.ALLOWED_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },
  swagger: {
    enabled: false,
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
  // ES 发布通道三模（module-es-outbox-transactional · 裁点乙）：生产严格缺省 inproc；
  // shadow/outbox 须经 event 投递列迁移人审 apply 后方可显式置位。
  eventPublish: {
    mode: (process.env.EVENT_PUBLISH_MODE || 'inproc') as 'inproc' | 'shadow' | 'outbox',
    pollMs: Number(process.env.EVENT_OUTBOX_POLL_MS || 1000),
  },
};

import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { ConfigService } from './config.service';
import defaultConfig from './envs/default';
import developmentConfig from './envs/development';
import productionConfig from './envs/production';

// 配置层校验换轨 zod（S2 · global-validation-zod-constitution-amendment）：
// zod v4 原生实现 StandardSchemaV1，@nestjs/config v12 的 validationSchema 一等公民消费（消旧 `as any`）。
// 语义对照旧 Joi：.valid→z.enum / Joi.number→z.coerce.number（env 恒为字符串）/ .required→必填(无 optional/default) /
// .optional→.optional / .default→.default / .uri(scheme)→z.url()+scheme refine / .pattern→.regex。
// 保留 baseSchema/betterAuthSchema 边界与 createSchemaForEnv 结构：配置面契约门禁 verify-config-contract 静态解析此形状。
const createSchemaForEnv = (_isProd: boolean) => {
  // Base schema for all environments（键名 4 空格缩进·供契约门禁行级解析·勿改缩进层级）
  const baseSchema = {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(7009),
    HOST: z.string().default('localhost'),
    API_PREFIX: z.string().default('api'),
    OPEN_API_VERSION: z.string().default('3.1.0'),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
        message: 'DATABASE_URL 须为 postgres:// 或 postgresql:// scheme',
      }),
    JWT_SECRET: z.string(),
    ALLOWED_ORIGINS: z.string(),
    JWT_EXPIRES_IN: z.string().default('30d'),
    JWT_REFRESH_SECRET: z.string(),
    JWT_REFRESH_EXPIRES_IN: z.string().default('90d'),
    STORAGE_PROVIDER: z.enum(['s3', 'alioss', 'tencentoss']).default('alioss'),
    STORAGE_BUCKET: z.string().default('my-bucket'),
    STORAGE_REGION: z.string(),
    STORAGE_ENDPOINT: z.string(),
    STORAGE_ACCESS_KEY_ID: z.string(),
    STORAGE_ACCESS_KEY_SECRET: z.string(),
    STORAGE_BASE_URL: z.string().optional(),
    STORAGE_MAX_FILE_SIZE: z.coerce.number().default(10485760),
    STORAGE_ALLOWED_MIME_TYPES: z
      .string()
      .default('image/jpeg,image/png,image/gif,application/pdf'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_PUBLIC_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_API_VERSION: z.string().optional(),
    PAYMENT_PROVIDER: z.enum(['stripe', 'alipay', 'wechat_pay']).default('stripe'),
    // ES 发布通道三模开关（module-es-outbox-transactional · 裁点乙·高危#6 随审计门签）：
    // 取代旧 EVENT_STORE_ENABLED 布尔；未置即缺省 inproc（envs 层兜底）。
    EVENT_PUBLISH_MODE: z.enum(['inproc', 'shadow', 'outbox']).optional(),
    EVENT_OUTBOX_POLL_MS: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    // ES R4 第二上下文推广写切换（module-es-r4-second-context-subscriptions §3-R4c·高危#1 逐次亲签）：
    // 订阅治理 convergeStatus/create 是否翻为「回放即真相」（缺省 false=原 CRUD 写逐字节不变·
    // optional⇒非必填不上 compose）。注（global-governance-lifecycle-consolidation 切片 D）：
    // 租户治理面 ES_TRUTH_SOURCE_TENANTS 旋钮已随治理面 ES 覆盖层退役。
    ES_TRUTH_SOURCE_SUBSCRIPTIONS: z.enum(['true', 'false']).optional(),
    // 生产限流信任链（module-auth-ip-trust）：反代网段 CIDR 逗号列表；未配=BA 安全默认（只信单值 XFF）。
    AUTH_TRUSTED_PROXIES: z.string().optional(),
    // 过期 session 回收周期任务（module-session-index-and-expiry-reclaim F2）：缺省关（未置 true
    // 即不启 timer）；均 optional⇒非必填，不上 compose 编排（不触四角对拍判据③）。
    SESSION_RECLAIM_ENABLED: z.enum(['true', 'false']).optional(),
    SESSION_RECLAIM_INTERVAL_MS: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
  };
  const betterAuthSchema = {};
  // Datadog 已移除（global-cn-adaptation G1 / D6）；生产 / 非生产环境 schema 一致。
  // allowUnknown:true → passthrough（保留未声明 env·与请求层 strict-by-default 相反·有意为之）；
  // abortEarly:false → zod 默认即收集全部 issue。
  return z
    .object({
      ...baseSchema,
      ...betterAuthSchema,
    })
    .passthrough();
};

const configModuleOptions = {
  isGlobal: true,
  envFilePath: '.env',
  load: [
    () => defaultConfig,
    () => (process.env.NODE_ENV === 'production' ? productionConfig : developmentConfig),
  ],
  validationSchema: createSchemaForEnv(process.env.NODE_ENV === 'production'),
};

@Global()
@Module({
  imports: [NestConfigModule.forRoot(configModuleOptions)],
  providers: [ConfigService],
  exports: [NestConfigModule, ConfigService],
})
export class ConfigModule {}

import './load-env';

import compression from '@fastify/compress';
import fastifyCors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { FastifyInstance } from 'fastify';
import * as yaml from 'js-yaml';
import { AppModule } from './app.module';
import { buildFastifyHttpOptions } from './common/fastify-http-options';
import { requestIdHook } from './common/request-id.hook';
import { createValidationPipe } from './common/validation-pipe';
import { ConfigService } from './config/config.service';
import { assertDataResidency, resolveEnforceMode } from './config/data-residency';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create Fastify-based NestJS application
  // trustProxy 与 BA 限流同源（AUTH_TRUSTED_PROXIES·module-common-rate-limit 乙裁）：
  // 反代后 req.ip 解出真客户端，Nest 限流墙按真 IP 分桶，防共享桶整站误杀。
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(buildFastifyHttpOptions(process.env.AUTH_TRUSTED_PROXIES)),
  );

  // Get application configuration
  const configService = app.get(ConfigService);
  const appConfig = configService.getAppConfig();
  logger.log(`Application configuration: ${JSON.stringify(appConfig)}`);
  const port = appConfig.port;
  const host = appConfig.host;
  const apiPrefix = appConfig.apiPrefix;
  const swaggerConfig = configService.getSwaggerConfig();

  // PIPL data-residency startup guard (C2 · D7).
  // strict => mainland-only, refuse to boot on violation (default when NODE_ENV=production).
  // warn   => log-and-continue (default for development/test; override via env).
  {
    const mode = resolveEnforceMode(process.env.NODE_ENV, process.env.DATA_RESIDENCY_ENFORCE);
    const extraAllowlist = (process.env.DATA_RESIDENCY_DB_HOST_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const dbConfig = configService.getDatabaseConfig();
    const storageConfig = configService.getStorageConfig();
    const report = assertDataResidency(
      {
        databaseUrl: dbConfig.url,
        storage: {
          provider: storageConfig?.provider,
          region: storageConfig?.region,
          endpoint: storageConfig?.endpoint,
          accessKeyId: storageConfig?.accessKeyId,
        },
      },
      mode,
      extraAllowlist,
    );
    if (report.warnings.length > 0) {
      logger.warn(`Data residency (warn mode): ${report.warnings.join(' | ')}`);
    }
    if (mode === 'strict' && report.errors.length > 0) {
      logger.error(`Data residency violation, refusing to boot: ${report.errors.join(' | ')}`);
      await app.close();
      process.exit(1);
    }
  }

  app.setGlobalPrefix(apiPrefix as string, {
    exclude: swaggerConfig?.path
      ? [swaggerConfig.path, 'openapi.json', 'openapi.yaml']
      : ['openapi.json', 'openapi.yaml'],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Setup global request validation（装配单源见 common/validation-pipe.ts：生产与 gated e2e 共用）
  app.useGlobalPipes(createValidationPipe());
  // cause fastify update, temp adapt
  const fastifyInstance = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;

  // 请求关联 id 统一链（module-common-request-correlation）：onRequest 先于全部 Nest 层，
  // 定 id + 回写响应头 + ALS 包裹全链（含 /health 旁路面）。
  fastifyInstance.addHook('onRequest', requestIdHook);

  await fastifyInstance.register(compression as any);
  await fastifyInstance.register(helmet as any);
  // CORS 白名单函数式回显（module-common-cors-whitelist）：`cors.origin` 现为 ALLOWED_ORIGINS
  // 解析所得白名单。凭 `credentials:true` 必须回显**具体 origin**（非 `*`）才兼容 cookie 凭证——
  // 无 Origin 头（同源/服务端调用）放行；命中白名单或含 `*` 回显自身；否则拒绝（不发头，浏览器阻断）。
  const corsConfig = configService.getCorsConfig();
  const corsAllowList = new Set<string>(
    Array.isArray(corsConfig.origin) ? corsConfig.origin : [corsConfig.origin],
  );
  await fastifyInstance.register(fastifyCors as any, {
    ...corsConfig,
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || origin === '*' || corsAllowList.has('*') || corsAllowList.has(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    // 前端可读回关联 id（FR-2）；registry 配置无 exposedHeaders，此处只增不改。
    exposedHeaders: ['x-request-id'],
  });

  // Register multipart plugin for file uploads with configuration from storage settings
  await fastifyInstance.register(fastifyMultipart as any, {
    limits: {
      fileSize: configService.getStorageConfig().maxFileSize,
      files: 1,
    },
    attachFieldsToBody: false,
  });

  // Setup Swagger API documentation
  if (swaggerConfig?.enabled) {
    const apiDocVersion = process.env.API_DOC_VERSION || swaggerConfig?.version || '1.0.0';

    // Generate Swagger OpenAPI document
    const options = new DocumentBuilder()
      .setOpenAPIVersion(swaggerConfig?.openApiVersion || '3.1.0')
      .setTitle(swaggerConfig?.title || 'API Documentation')
      .setDescription(swaggerConfig?.description || 'API Documentation Description')
      .addBearerAuth()
      .setVersion(apiDocVersion)
      .build();

    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup(swaggerConfig?.path || 'apidoc', app, document);

    // Add YAML format OpenAPI document endpoint
    fastifyInstance.get('/openapi.yaml', (_, reply) => {
      reply.header('Content-Type', 'text/yaml');
      reply.send(yaml.dump(document));
    });

    logger.log(`Swagger documentation available at /${swaggerConfig?.path || 'apidoc'}`);
    logger.log(`OpenAPI YAML available at /openapi.yaml`);
  }

  // Start the application
  await app.listen(port ?? 7009, host ?? 'localhost');
  const appUrl = await app.getUrl();
  logger.log(`Application is running on: ${appUrl}`);

  if (swaggerConfig?.enabled) {
    const swaggerPath = swaggerConfig?.path || 'apidoc';
    logger.log(`Swagger API documentation available at: ${appUrl}/${swaggerPath}`);
    logger.log(`OpenAPI JSON available at: ${appUrl}/openapi.json`);
    logger.log(`OpenAPI YAML available at: ${appUrl}/openapi.yaml`);
  }
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error(`Failed to start application: ${err.message}`, err.stack);
  process.exit(1);
});

// S9 铁律：构造函数注入的类必须值导入 + 显式 @Inject（仅类型位会被 Biome autofix 成 import type →
// design:paramtypes 退化、DI 运行时 UnknownDependenciesException——原 AuthMiddleware 同款写法）
import { ConfigService } from '@app/config/config.service';
// 切片 3b：S9 铁律——构造注入的类必**值导入** + 显式 @Inject（`MikroOrmService` 经 @Global `MikroOrmModule` 可达）。
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { MailerService } from '@app/mailer/mailer.service';
import { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { BetterAuthOptions } from 'better-auth';
import { AuthInstanceInjectKey } from './auth.constant';
import { CreateAuth } from './auth.implement';
import type { InjectAuthInstance } from './auth.interface';
import { formatGenericChannelDiagnostics, resolveGenericChannels } from './generic-oauth-channels';
import { planProviderDiagnostics, resolveSocialProviders } from './social-provider-registration';

/** 接线所需的最小 Fastify 实例面（避免全类型依赖 fastify 导入面）。 */
interface FastifyLike {
  all: (path: string, handler: (req: unknown, reply: FastifyLikeReply) => Promise<void>) => unknown;
}
interface FastifyLikeReply {
  raw: { writableEnded: boolean };
  code: (status: number) => unknown;
  send: (body: unknown) => unknown;
}

/**
 * BA HTTP 面接线（module-auth-http-surface·人裁甲1+乙1+丙+丁+戊）：
 * 原 AuthMiddleware 的 handler 装配职责保留，转发职责改为 **Fastify 实例级通配路由**——
 * 旧中间件 forRoutes 通配只绑定已注册 Nest 路由（`/api/v1/auth/**` 下无路由），router 先 404、
 * handler 永不得跑，BA 原生 HTTP API 面整面不可达（实机四探存照）。实例级 `all()` 绕开
 * Nest router/guard/validation 三层，与 BA "原生 handler 吃 req/res" 形态最贴合；
 * basePath 维持 CreateAuth 现值 `/api/v1/auth`（乙1）。
 */
@Injectable()
export class AuthBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthBootstrapService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(MikroOrmService) private readonly mikroOrmService: MikroOrmService,
    @Inject(QuotaService) private readonly quotaService: QuotaService,
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(MailerService) private readonly mailerService: MailerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { handler, auth } = await CreateAuth(
      this.buildSocialProviders(),
      this.buildGenericConfigs(),
      this.mikroOrmService,
      this.configService,
      this.quotaService,
      this.mailerService,
    );
    this.authInstance.set(auth);

    const basePath = (auth.options as { basePath?: string }).basePath ?? '/api/v1/auth';
    // spike 实锤（fastify 5.12.5/find-my-way 9.10.0）：仅支持裸尾 `*` 通配，`{*name}` 语法报
    // "Wildcard must be the last character"——挂 basePath 下全部 BA 原生端点。
    const pattern = `${basePath}/*`;
    const app = this.httpAdapterHost.httpAdapter.getInstance<FastifyLike>();
    app.all(pattern, async (req, reply) => {
      try {
        // Fastify 已消费 raw 流完成 body 解析；better-call 的 node 适配器（BA 底座）对
        // "已解析体"有原生兼容分支（req.body !== undefined → 序列化回放，见
        // better-call@1.4.0 dist/adapters/node/request.mjs getRequest），故把解析结果挂回
        // raw 即可——不挂则 BA 读到空流报 "[body] expected object, received undefined"（实机坐实）。
        const raw = req as { raw?: { body?: unknown }; body?: unknown };
        if (raw.raw && raw.raw.body === undefined && raw.body !== undefined) {
          raw.raw.body = raw.body;
        }
        await handler(req as never, reply as never);
      } catch (error) {
        // handler 内部已有 res.code(500) 兜底；此处只防"未写响应即抛"造成悬挂连接。
        this.logger.error(`BA handler error: ${(error as Error).message}`);
        if (!reply.raw.writableEnded) {
          reply.code(500);
          reply.send({ message: (error as Error).message });
        }
      }
    });
    this.logger.log(`Better Auth HTTP surface mounted at ${pattern} (Fastify instance-level)`);
  }

  /**
   * 境内渠道装配（与上方 social 面同一口径）：旧写法对无构建器 / 无凭证两条分支静默 `continue`。
   * 强度区别在于：generic 面的既有契约明确保证「不配凭证可正常启动」（`.env.example` 的
   * OAUTH_GENERIC_PROVIDERS 段 + D8/NFR-2「未配即降级」人裁）⇒ 本层只补可见化，
   * **一律 warn（含生产）而不拒启**；是否升级为 fail-loud 归人（已登记 plan 缓行）。
   */
  private buildGenericConfigs() {
    const oauth = this.configService.getOAuthConfig();
    const { configs, drops } = resolveGenericChannels(
      oauth.genericProviders ?? [],
      oauth.secrets ?? {},
    );
    if (drops.length > 0) {
      this.logger.warn(formatGenericChannelDiagnostics(drops));
    }
    return configs;
  }

  /**
   * 社交渠道装配（module-config-env-surface-contract 切片 A）：旧写法对三条不满足分支直接
   * `continue`（不在枚举 / 无 secrets 槽位 / 槽位无凭证），导致「文档承诺已接、实际静默未注册」
   * 且 boot 日志零线索（F3 实机存照）。现裁决下沉为纯函数，本层只按强度执行：
   * 生产 fail-loud 拒启（配置错位不得静默降级）、非生产给一条自述真因的 warn。
   */
  private buildSocialProviders(): BetterAuthOptions['socialProviders'] {
    const oauth = this.configService.getOAuthConfig();
    const enabledTypes = oauth.providers.filter((p) => p.enabled).map((p) => p.type);
    const { registered, drops } = resolveSocialProviders(enabledTypes, oauth.secrets ?? {});
    const plan = planProviderDiagnostics(drops, process.env.NODE_ENV === 'production');
    if (plan.mode === 'throw') {
      throw new Error(
        `生产环境不得静默弃用已启用的 OAuth 社交渠道（fail-loud，修好再启动）：\n${plan.message}`,
      );
    }
    if (plan.mode === 'warn') {
      this.logger.warn(plan.message);
    }
    const providers = {} as NonNullable<BetterAuthOptions['socialProviders']>;
    for (const r of registered) {
      (providers as Record<string, unknown>)[r.type] = {
        clientId: r.clientId,
        clientSecret: r.clientSecret,
        ...r.extras,
      };
    }
    return providers;
  }
}

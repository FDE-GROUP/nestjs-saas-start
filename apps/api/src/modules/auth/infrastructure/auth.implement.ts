import type { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import { Logger } from '@nestjs/common';
import {
  BetterAuthError,
  type BetterAuthOptions,
  type BetterAuthPlugin,
  betterAuth,
} from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { toNodeHandler } from 'better-auth/node';
import {
  type GenericOAuthConfig,
  genericOAuth,
  magicLink,
  organization,
} from 'better-auth/plugins';
import type { FastifyReply, FastifyRequest } from 'fastify';
// 限流信任链解析单源已出至 common/trusted-proxies（module-common-rate-limit 乙裁：
// 同一 env 喂 BA 限流 + Nest 限流墙双链，防双链漂移）。
import { parseTrustedProxies } from '../../../common/trusted-proxies';
import type { ConfigService } from '../../../config/config.service';
import type { MikroOrmService } from '../../../database/mikro/mikro-orm.service';
import type { MailerService } from '../../../mailer/mailer.service';
import { createSeatsQuotaPlugin } from './seats-quota.hook';

export type AuthRequest = FastifyRequest & { originalUrl?: string; url?: string };
export type AuthResponse = FastifyReply;

/**
 * BA 内置 org 授权 HTTP 面封堵谓词（module-rbac-casl 甲裁·严格拆）：
 * 取 pathname（query 不参与）判 `/organization` 段——命中则 handler 直接 404，
 * 成员/邀请/职权管理收归我方门面（@Can·CASL 裁决）；服务端 auth.api.* 直调不经
 * HTTP 不受影响。单测锁形，避免封堵谓词只能经真 HTTP 验证的盲区。
 */
export function isSealedOrgHttpPath(url: string): boolean {
  const pathname = url.split('?')[0];
  return pathname.endsWith('/organization') || pathname.includes('/organization/');
}

/**
 * magic-link 发信编排（module-auth-magic-link v0.4.0 · 人令「开发环境控制台打印链接」）：
 * 非生产先把一次性链接打进日志（未配 SMTP / 发信失败也可直连浏览器点用·链接含一次性 token
 * 故**生产绝不打**——泄露面即 NODE_ENV 门），发信失败降为 warn 非致命；生产语义与原实现全等
 * （不发链接、发信失败上抛）。抽具名导出供单测锁形（镜 isSealedOrgHttpPath 谓词先例）。
 */
export function createMagicLinkSender(mailer: MailerService) {
  const logger = new Logger('MagicLink');
  return async ({ email, url }: { email: string; url: string }): Promise<void> => {
    const isProd = process.env.NODE_ENV === 'production';
    if (!isProd) {
      logger.log(`开发模式 magic-link（未配 SMTP 亦可，浏览器直接打开）：${url}`);
    }
    try {
      await mailer.sendMagicLinkEmail(email, url);
    } catch (e) {
      if (isProd) {
        throw e;
      }
      logger.warn(`magic-link 发信失败（dev 非致命·链接已打印控制台）：${(e as Error).message}`);
    }
  };
}

export interface CreateAuthResult {
  handler: (req: AuthRequest, res: AuthResponse) => Promise<any>;
  auth: {
    options: any;
    api: {
      getSession: (params: any) => Promise<any>;
      getProviders: () => string[];
      listUserAccounts: (params: any) => Promise<any>;
      // 建租户唯一通道（S4 · FR-1）：透传 organization 插件 createOrganization（服务端系统动作）。
      createOrganization: (params: any) => Promise<any>;
      // 服务端登录编排面（S9 补遗 · 真·BA 登录 e2e 及系统侧用户开通复用）：透传 better-auth 原生
      // signUpEmail / signInEmail / organization set-active，配合 `asResponse:true` 由 BA 自身签发
      // 真实 session cookie（含签名）——与 createOrganization 同一「服务端编排网关」范式，加法式暴露。
      signUpEmail: (params: any) => Promise<any>;
      signInEmail: (params: any) => Promise<any>;
      setActiveOrganization: (params: any) => Promise<any>;
      // S7 收尾 · 成员入组双端点透传（服务端编排面·e2e 驱动用）：dispatch.mjs 坐实
      // auth.api.* 与 router 走同一 hooks pipeline，seats 配额 hook 同样生效。
      // 邀请发出端点：server key 为 createInvitation（HTTP path 才是 /organization/invite-member）。
      createInvitation: (params: any) => Promise<any>;
      acceptInvitation: (params: any) => Promise<any>;
      // module-rbac-casl 甲裁（严格拆）：BA 内置 org HTTP 面封堵后，我方门面（admin/self）与
      // 丙裁角色预注入唯经此窄门面服务端直调（server key 对拍 organization.mjs 路由表：
      // listMembers/updateMemberRole/removeMember/listInvitations/cancelInvitation/
      // listOrganizations/leaveOrganization/rejectInvitation/listUserInvitations/getActiveMemberRole）。
      getActiveMemberRole: (params: any) => Promise<any>;
      listMembers: (params: any) => Promise<any>;
      updateMemberRole: (params: any) => Promise<any>;
      removeMember: (params: any) => Promise<any>;
      listInvitations: (params: any) => Promise<any>;
      cancelInvitation: (params: any) => Promise<any>;
      listOrganizations: (params: any) => Promise<any>;
      leaveOrganization: (params: any) => Promise<any>;
      rejectInvitation: (params: any) => Promise<any>;
      listUserInvitations: (params: any) => Promise<any>;
    };
  };
}

export async function CreateAuth(
  providers: BetterAuthOptions['socialProviders'],
  genericConfigs: GenericOAuthConfig[],
  mikroOrmService: MikroOrmService,
  configService: ConfigService,
  quota: Pick<QuotaService, 'checkSeats'>,
  mailer: MailerService,
): Promise<CreateAuthResult> {
  const appConfig = configService.getAppConfig();
  const authConfig = configService.getAuthConfig();
  const corsConfig = configService.getCorsConfig();
  // URI 版本段与 main.ts `enableVersioning({ defaultVersion: '1' })` 同源（对外前缀 /api/v1）。
  // 曾误用 appConfig.version（API_VERSION='1.0'·接口语义是文档版本）拼 basePath——BA HTTP 面
  // 整面 404 的第二层缺陷（实机 mount 到 /api/1.0 坐实），module-auth-http-surface v0.3 订正。
  const basePath = `/${appConfig.apiPrefix}/v1/auth`;

  // 乙1·生产缺配显性化（双链同源后一响盖两面）：反代部署未配 trustedProxies 时
  // BA 限流与 Nest 限流墙（Fastify req.ip·module-common-rate-limit）同落共享桶——启动日志一响，
  // 不拦启动（直连部署未必有反代，无 PIPL 级法定依据不做 fail-closed）。
  const trustedProxies = parseTrustedProxies(process.env.AUTH_TRUSTED_PROXIES);
  if (process.env.NODE_ENV === 'production' && !trustedProxies) {
    new Logger('CreateAuth').warn(
      'AUTH_TRUSTED_PROXIES 未配置：若经反向代理部署，Better Auth 限流与 Nest 限流墙（req.ip）将把所有用户归入共享桶（no-trusted-ip）导致登录面/全路由面整站误杀——请配置代理网段 CIDR（逗号分隔）',
    );
  }

  // module-auth-magic-link-production：magic-link 已无条件挂载（含生产），邮件内一次性链接
  // 的绝对 URL 依赖 canonical `baseURL`（=APP_URL·见下 betterAuth 配置）。生产缺 APP_URL 时 BA
  // 回退请求 origin——反代部署下常得内网 host/错域→链接不可点。采 warn 非 fail-closed（镜上方
  // trustedProxies 先例：直连部署未必需 canonical，不拦启动）；真值归运维（§2 密钥/env 不由 Agent 臆造）。
  if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) {
    new Logger('CreateAuth').warn(
      'APP_URL 未配置：magic-link 免密登录邮件内的一次性链接将回退请求 origin（反代后易为内网 host/错域而不可点）——生产请设 canonical 公网 URL（与 CORS_ORIGIN 前端源协同·originCheck 才放行回跳）',
    );
  }

  // ORM 修宪案 B · 切片 4（contract）：BA 数据面**唯自持 Mikro adapter**（全站 BA 读写唯此一处出口）。
  // `原 BA adapter` 分支与 `schema` import 已随旧 ORM 依赖一并退场（双轨收口·不再保留回滚阀）。
  // `createAuthAdapter()` 内部 `await ensure()` 懒建·`app-boot.smoke` 只 `compile()` 不触发本钩子故仍 DB-free。
  const database = await mikroOrmService.createAuthAdapter();

  const auth = betterAuth({
    database,
    socialProviders: providers,
    basePath: basePath,
    // magic-link 等需绝对 URL 的面（邮件内一次性链接）依赖 canonical base；复用既有 `APP_URL`
    // raw env（与 mailer 同源），未配则 undefined → BA 回退请求 origin（既有行为不变）。
    baseURL: process.env.APP_URL || undefined,
    trustedOrigins: Array.isArray(corsConfig.origin)
      ? corsConfig.origin
      : corsConfig.origin?.split(',') || [],
    plugins: [
      // Session provider tracking plugin
      {
        id: 'add-account-to-session',
        hooks: {
          after: [
            {
              matcher(context) {
                return context.path?.startsWith('/callback') ?? false;
              },
              handler: createAuthMiddleware(async (ctx) => {
                const provider = ctx.params?.id || ctx.path.split('/callback')[1];
                if (!provider) {
                  return;
                }

                let finalSessionId = '';
                const sessionCookie = ctx.getHeader(ctx.context.authCookies.sessionToken.name);

                if (sessionCookie) {
                  const sessionId = sessionCookie.split('.')[0];
                  if (sessionId) {
                    finalSessionId = sessionId;
                  }
                }

                if (!finalSessionId) {
                  const setSessionToken = ctx.getHeader('set-cookie');

                  if (setSessionToken) {
                    const sessionId = setSessionToken.split(';')[0].split('=')[1].split('.')[0];

                    if (sessionId) {
                      finalSessionId = sessionId;
                    }
                  }
                }

                if (!finalSessionId) {
                  return;
                }

                try {
                  // Use a more compatible approach by storing the info in context metadata
                  // which won't trigger type errors with the session object
                  const metadata = (ctx.context as any).metadata || {};
                  metadata.provider = provider;
                  (ctx.context as any).metadata = metadata;

                  // Log the action instead of trying to update DB directly
                  await Promise.resolve(); // for eslint
                  console.log(`Session ${finalSessionId} associated with provider ${provider}`);
                } catch (error) {
                  console.error('Failed to store provider information:', error);
                }
              }),
            },
          ],
        },
        schema: {
          session: {
            fields: {
              provider: {
                type: 'string',
                required: false,
              },
            },
          },
        },
      } satisfies BetterAuthPlugin,
      // 境内登录渠道（方案 C · FR-3/A1）：有配置才挂 genericOAuth 插件（NFR-2 未配即降级）
      ...(genericConfigs.length > 0 ? [genericOAuth({ config: genericConfigs })] : []),
      // 多租户（混合复用 · S0/S1/S3）：org 插件**仅作认证·数据源**（tenant/member/invitation
      // 表 + activeOrganizationId 落 session·D4）——module-rbac-casl 甲裁（人裁新宪）：授权裁决
      // 归 CASL（authorization-rules 单源），BA ac 插件/自定义 roles 退场；本仓业务端点由门面
      // （@Can + AuthorizationGuard）承接，BA 内置 org HTTP 端点面在 handler 入口封堵（见下）。
      // S4（FR-1 审批制）：`allowUserToCreateOrganization: false` 封死 HTTP 自助即时开通（现叠加
      // 封堵双保险）；建租户唯一通道 = 服务端系统动作（无 session + body.userId → isSystemAction·
      // 源码坐实不受此开关限），由 tenants 申请端点独享（强制组织行 organization.status=pending_approval·
      // consolidation 切片 B 归位真列·收权案后 BA metadata 不再携态）。
      organization({
        allowUserToCreateOrganization: false,
      }),
      // S7 收尾（vision §7 阶段 2 商业闭环）：成员增量端点（accept-invitation 为现网唯一真实
      // HTTP 通道）经插件级 before-hook 走 seats 配额前置校验，超限 402（详 seats-quota.hook.ts）。
      // ORM 修宪案 B 切片 3d（S-d3）：invitation 读改走 Mikro（懒 fork·DB-free 不变量保持）。
      createSeatsQuotaPlugin({ quota, mikro: mikroOrmService }),
      // module-auth-magic-link + module-auth-magic-link-production（人令「你自行裁定」·§2 auth
      // 高危问责归签核人）：免密邮件登录**无条件挂载**（含生产）。形态采**乙·仅存量用户登录**
      // （`disableSignUp:true`·better-auth@1.7.7 源码坐实默认 false→陌生邮箱 verify 时自动
      // createUser(emailVerified:true)=新增公开 signup 口；自主裁下取最小风险档不新开注册面）。
      // 发信经既有 MailerService（MJML + i18n）。生产依赖 APP_URL canonical（见上方 warn）
      // 与 CORS_ORIGIN∈trustedOrigins（originCheck 放行回跳）——真值归运维。零迁移（token 存 verification 表）。
      magicLink({
        expiresIn: 300,
        disableSignUp: true,
        // dev 控制台打印链接 + SMTP 失败非致命；生产语义不变（见 createMagicLinkSender）。
        sendMagicLink: createMagicLinkSender(mailer),
      }),
    ],
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
      },
    },
    // 限流由库默认开启（登录类路径 3 次/10s）；结构在场=显式意图（丙），窗值跟库默认不预调。
    rateLimit: { enabled: true },
    advanced: {
      // CSRF 纵深防御（module-auth-csrf-defense · 丙）：把「靠 BA 缺省」的 lax 显式钉死（部分合并·
      // 不冲掉 httpOnly/secure/path）；跨源前端需求出现时经此翻 none（叠 secure）。
      defaultCookieAttributes: { sameSite: 'lax' },
      ipAddress: {
        ...(trustedProxies ? { trustedProxies } : {}),
      },
    },
    // 邮箱+密码登录面（S9 补遗 · 真·BA 登录编排 e2e 依赖）：**仅在非生产环境启用**
    // （`NODE_ENV!=='production'`）——生产安全面零改动（仍关），test/dev 开启以驱动真实
    // signUp/signIn 编排。补齐「邮箱为体」CN 登录面进生产属独立产品决策（D8 排序/验证/策略），不在此预置。
    emailAndPassword: {
      enabled: process.env.NODE_ENV !== 'production',
      autoSignIn: true,
      minPasswordLength: 8,
    },
    appName: appConfig.name || 'NestJS SaaS Start',
    secret: authConfig.jwt.secret,
    user: {
      additionalFields: {
        isOwner: {
          type: 'boolean',
          defaultValue: false,
          input: false,
        },
        handle: {
          type: 'string',
          defaultValue: '',
        },
      },
    },
  });

  const handler = async (req: AuthRequest, res: AuthResponse) => {
    try {
      res.header('access-control-allow-methods', 'GET, POST');
      res.header('access-control-allow-headers', 'content-type');
      res.header(
        'Access-Control-Allow-Origin',
        req.headers.origin || req.headers.referer || req.headers.host || '*',
      );
      res.header('access-control-allow-credentials', 'true');

      // Handle Fastify requests
      const url = req.originalUrl || req.url || req.raw.url;
      if (!url) {
        throw new Error('Request URL is missing');
      }

      // 订正（module-auth-http-surface·实机坐实）：Fastify 的 `req.url`/`req.originalUrl` 均为
      // 原型只读 getter，Express 时代的回写赋值抛 `Attempted to assign to readonly property`
      //（整面 500）。实例级接线递来的 raw.url 即完整路径，BA 自剥 basePath 匹配，无需任何
      // 改写；旧「保形 Express 兼容层」整段退役。

      // module-rbac-casl 甲裁（严格拆）：BA org 内置 HTTP 端点面封堵（谓词见 isSealedOrgHttpPath）。
      // 授权/成员/邀请管理收归我方门面（@Can·CASL 裁决）；服务端 auth.api.*
      // 直调（门面/e2e 编排/seats hook）不经 HTTP，不受封堵影响。
      if (isSealedOrgHttpPath(url)) {
        return res.code(404).send({ message: 'Not Found' });
      }

      // Only modify socket encryption if needed, don't replace the entire socket
      if (req.raw && req.raw.socket) {
        // Use type assertion since the socket may be from different request types
        (req.raw.socket as any).encrypted = true;
      }

      const handler = toNodeHandler(auth)(req.raw, res.raw);

      return handler;
    } catch (error) {
      console.error(error);
      // throw error
      return res.code(500).send((error as any).message);
    }
  };

  return {
    handler,
    auth: {
      options: auth.options,
      api: {
        getSession(params: Parameters<typeof auth.api.getSession>[0]) {
          return auth.api.getSession(params);
        },
        getProviders() {
          return [
            ...Object.keys(auth.options.socialProviders || {}),
            ...genericConfigs.map((c) => c.providerId),
          ];
        },
        async listUserAccounts(params: Parameters<typeof auth.api.listUserAccounts>[0]) {
          try {
            const result = await auth.api.listUserAccounts(params);
            return result;
          } catch (error) {
            if (error instanceof BetterAuthError) {
              return null;
            }
            throw error;
          }
        },
        // 租户级 RBAC 判定旧 BA hasPermission 透传已随 module-rbac-casl 退场（裁决归 CASL）。
        // S4 · FR-1：申请建租户的服务端系统动作（无 session + body.userId → isSystemAction），
        // 绕过 HTTP 层 `allowUserToCreateOrganization:false` 封禁，由 tenants 申请端点独享。
        createOrganization(params: Parameters<typeof auth.api.createOrganization>[0]) {
          return auth.api.createOrganization(params);
        },
        // S9 补遗 · 真·BA 登录编排：透传 better-auth 原生邮箱注册/登录 + 组织切换（服务端系统侧）。
        // e2e/系统开通以 `{ body, asResponse: true }` 调用即得 BA 自签的真实 session cookie，供后续请求回放。
        signUpEmail(params: Parameters<typeof auth.api.signUpEmail>[0]) {
          return auth.api.signUpEmail(params);
        },
        signInEmail(params: Parameters<typeof auth.api.signInEmail>[0]) {
          return auth.api.signInEmail(params);
        },
        setActiveOrganization(params: any) {
          return (auth.api as any).setActiveOrganization(params);
        },
        // S7 收尾 · 邀请发出/接受（member 行落行时点）：服务端透传同样经 dispatch 的 hooks
        // pipeline（seats 配额 hook 不区分 HTTP/服务端通道），e2e 以此驱动真实入组流程。
        createInvitation(params: any) {
          return (auth.api as any).createInvitation(params);
        },
        acceptInvitation(params: any) {
          return (auth.api as any).acceptInvitation(params);
        },
        // module-rbac-casl 甲裁：成员/邀请管理门面 + 丙裁角色预注入的服务端直调透传。
        // 纯加法透传（与 createOrganization/createInvitation 同范式）：BA 侧 membership/
        // last-owner/seats 等数据校验与 hooks pipeline 照旧生效。
        getActiveMemberRole(params: any) {
          return (auth.api as any).getActiveMemberRole(params);
        },
        listMembers(params: any) {
          return (auth.api as any).listMembers(params);
        },
        updateMemberRole(params: any) {
          return (auth.api as any).updateMemberRole(params);
        },
        removeMember(params: any) {
          return (auth.api as any).removeMember(params);
        },
        listInvitations(params: any) {
          return (auth.api as any).listInvitations(params);
        },
        cancelInvitation(params: any) {
          return (auth.api as any).cancelInvitation(params);
        },
        listOrganizations(params: any) {
          return (auth.api as any).listOrganizations(params);
        },
        leaveOrganization(params: any) {
          return (auth.api as any).leaveOrganization(params);
        },
        rejectInvitation(params: any) {
          return (auth.api as any).rejectInvitation(params);
        },
        listUserInvitations(params: any) {
          return (auth.api as any).listUserInvitations(params);
        },
      },
    },
  };
}

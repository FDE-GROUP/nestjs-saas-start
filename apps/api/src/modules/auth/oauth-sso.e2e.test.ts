import 'reflect-metadata';
// 副作用先行：`default.ts` 导入期读 env，须早于任何触达 config 的模块求值（见 setup 文件注）。
import './oauth-sso.e2e.setup';
import { createValidationPipe } from '@app/common/validation-pipe';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Account,
  Session,
  User,
} from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '@app/modules/organizations/domain/repositories/organization-governance.repository';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * SSO 身份提供方（OP）隐式流全链 e2e（oauth-sso-odoo-integration 切片 E·env-gated 真库）：
 * 真 HTTP 全链模拟 Odoo `auth_oauth` 消费——BA 登录拿会话 → `authorize` 302 取 fragment
 * `access_token` → 以 Bearer 打 `userinfo` 拿裸 `{sub,email,name}`，并锁住会话墙/验签/aud 门。
 *
 * 复用 `auth-http-surface.e2e.test.ts` 同款 harness（AppModule 全树 boot + `app.inject` 命中
 * 完整 Nest router/guard/validation 链·B1 override OutboxRelay 节后台轮询）。默认跳过：仅当
 * `E2E_DATABASE_URL` 存在时运行（`ci:db` 编排器已迁移+seed），不破默认 CI 的 DB-free 不变量。
 * 夹具（user/session/account）afterAll 清净，时间戳唯一 email 幂等。
 *
 * authorize 携会话 + ready 绑定 + 已注册 client/精确 redirect → 302 + fragment access_token（切片 D 门禁改造）：
 * 门禁前该用例仅需会话；现 `buildAuthorizeRedirect` 铸令牌前跑 `canUseOdoo`——故先置活跃租户 ready 绑定
 * （bind-existing 直落 ready）与会话 `activeOrganizationId`，并补「无绑定 → 403」fail-closed 用例。
 * 门禁只读 SaaS 侧绑定态，无需活体 Odoo。
 *
 * client 注册表经 env `SSO_OAUTH_CLIENTS` 注入（切片 B config 面·boot 前设置即生效）。
 */

const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

const PASSWORD = 'E2e-S50-Pa55w0rd!';
const CLIENT_ID = 'e2e-odoo';
const REDIRECT = 'http://localhost:8069/odoo/oauth2/callback';

gated('SSO OP 隐式流全链 e2e（真库·env-gated·切片 E）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  const stamp = Date.now();
  const email = `e2e-sso-${stamp}@example.com`;
  let userId: string | undefined;
  let cookie = '';
  let accessToken = '';
  let governance: OrganizationGovernanceRepository;
  const orgReady = `e2e-sso-ready-${stamp}`;
  const orgNoBinding = `e2e-sso-nobind-${stamp}`;
  const companyReady = 500000 + (stamp % 1000000000);

  beforeAll(async () => {
    // client 注册表已由 `./oauth-sso.e2e.setup`（首条 import）在 config 求值前就位。
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // 与生产入口（main.ts）同装配：全局前缀 + URI 版本化——Nest controller 路径依赖此二者
    // （BA 实例级通配 `/api/v1/auth/*` 为字面量注册故 `auth-http-surface` 不需·我方 oauth2 controller 需）。
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
    governance = app.get(ORGANIZATION_GOVERNANCE_REPOSITORY);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    if (userId) {
      const em = await mikro.fork();
      await em.nativeDelete(Session, { userId } as never);
      await em.nativeDelete(Account, { userId } as never);
      await em.nativeDelete(User, { id: userId } as never);
      await em.nativeDelete(Organization, { id: { $in: [orgReady, orgNoBinding] } } as never);
    }
    await app.close();
  });

  it('前置：BA 注册 + 登录取会话·邮箱置已验证（userinfo 硬门所需）', async () => {
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up/email',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      payload: JSON.stringify({ email, password: PASSWORD, name: 'e2e-sso' }),
    });
    expect(signUp.statusCode).toBe(200);
    userId = (JSON.parse(signUp.body) as { user: { id: string } }).user.id;

    // 置 emailVerified=true（signUp 缺省未验证·本端点硬门要求）。
    const em = await mikro.fork();
    await em.nativeUpdate(User, { id: userId } as never, { emailVerified: true } as never);

    const signIn = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in/email',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      payload: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(signIn.statusCode).toBe(200);
    const setCookie = signIn.headers['set-cookie'];
    cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .filter(Boolean)
      .map((c) => String(c).split(';')[0])
      .join('; ');
    expect(cookie).toMatch(/better-auth\.session_token/i);
  });

  it('authorize 无会话 → 401（全局会话墙 deny-by-default 锁）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=token&scope=openid%20email`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('authorize 携会话 + ready 绑定 + 已注册 client/精确 redirect → 302 + fragment access_token', async () => {
    // 切片 D 门禁：先置活跃租户 ready 绑定（bind-existing 直落 ready）+ 会话 activeOrganizationId。
    const em = await mikro.fork();
    await em.insert(Organization, {
      id: orgReady,
      name: 'E2E Ready',
      slug: `e2e-sso-r-${stamp}`,
      metadata: {},
    } as never);
    await governance.bindOdooCompany(orgReady, {
      odooCompanyId: companyReady,
      odooCompanyName: `SAAS-${orgReady}`,
    });
    await em.nativeUpdate(
      Session,
      { userId } as never,
      { activeOrganizationId: orgReady } as never,
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=token&scope=openid%20email&state=nonce-1`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(302);
    const location = String(res.headers.location);
    expect(location.startsWith(`${REDIRECT}#`)).toBe(true);
    const frag = new URLSearchParams(location.slice(location.indexOf('#') + 1));
    accessToken = frag.get('access_token') ?? '';
    expect(accessToken.split('.')).toHaveLength(3);
    expect(frag.get('token_type')).toBe('Bearer');
    expect(frag.get('state')).toBe('nonce-1');
  });

  it('authorize 携会话但活跃租户未绑定（未开通）→ 403（fail-closed·审批≠可入）', async () => {
    const em = await mikro.fork();
    await em.insert(Organization, {
      id: orgNoBinding,
      name: 'E2E NoBind',
      slug: `e2e-sso-nb-${stamp}`,
      metadata: {},
    } as never);
    await em.nativeUpdate(
      Session,
      { userId } as never,
      { activeOrganizationId: orgNoBinding } as never,
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=token&scope=openid%20email`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('authorize 未注册 client_id → 400（不重定向到未登记地址）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/oauth2/authorize?client_id=unregistered&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=token`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('authorize response_type≠token → 400（隐式流协议钉死·zod 契约层拒入）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('userinfo 携 Bearer（无 cookie·@Public 旁墙）→ 200 裸 JSON {sub,email,name}（非信封）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/oauth2/userinfo',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    // 裸 JSON 锁：不得被全局 TransformInterceptor 包 {data,...} 信封（否则 Odoo 解析失败）。
    expect(body).not.toHaveProperty('data');
    expect(body.sub).toBe(userId);
    expect(body.email).toBe(email);
    expect(body.name).toBe('e2e-sso');
  });

  it('userinfo 非法 Bearer → 401（验签 fail-closed·旁墙但自带 Bearer 校验）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/oauth2/userinfo',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('userinfo 邮箱改回未验证 → 403（硬门）', async () => {
    const em = await mikro.fork();
    await em.nativeUpdate(User, { id: userId } as never, { emailVerified: false } as never);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/oauth2/userinfo',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

/*
 * 本地跑法（沿用 auth-http-surface 的专用 nestjs_e2e 库先例）：
 *   E2E_DATABASE_URL=... DATABASE_URL=... pnpm exec vitest run \
 *     apps/api/src/modules/auth/oauth-sso.e2e.test.ts
 * 在链跑法：`pnpm run ci:db`（编排器 Testcontainers PG→迁移→seed→跑全部 GATED_E2E_FILES）。
 */

import 'reflect-metadata';
import { createValidationPipe } from '@app/common/validation-pipe';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  Account,
  Session,
  User,
} from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

/**
 * S9 补遗 · 全栈 e2e 第二层的**真·Better Auth 登录编排**形态（v0.18.10·「全栈 CI 拼 PG」专项）。
 *
 * 与旧版差异：**去掉 `AuthInstanceInjectKey` 的 `getSession` 打桩**——本测把 Better Auth 的
 * **真实登录链路整条跑起来**（服务端 API·`asResponse:true` 令 BA 自签含 HMAC 的真实 session cookie）：
 *   `signUpEmail` 建真实用户 → `signInEmail` 取真实会话 cookie → 服务端系统动作 `createOrganization`
 *   （绕 `allowUserToCreateOrganization:false`·申请人成首名 owner member）→ `setActiveOrganization`
 *   把 `activeOrganizationId` 落进真实 session 行。此后带**真 cookie** 打 `/posts`，`TenantIsolationMiddleware`
 *   经真实 `RequestSessionReader`→`auth.api.getSession` 解析会话绑进 ALS、全局 `SessionGuard`（会话墙）
 *   与全局 `TenantIsolationGuard`（租户墙）逐级 fail-closed、CQRS/仓储注入 `organizationId` 谓词——
 *   **全程无认证桩**，真实 user/session/organization/member 行，证真「邮箱+密码 → 会话 → 租户上下文 →
 *   跨租户隔离」这条编排端到端成立。
 *
 * 走服务端 API 而非 HTTP：Test harness 不复现 `main.ts` 的全局前缀/版本化装配（BA HTTP 端点在测试里
 * 无匹配 Nest 路由 → 中间件不触发 → 404），故经 auth 网关透传的原生 `api.*`（`createOrganization` 同款
 * 「服务端编排网关」范式）驱动真实流程——同样是真 BA、真会话、真隔离，仅绕开测试未装配的 HTTP 中间件层。
 *
 * 断言含 S11 双层全局墙的**语义分层** + rehierarchy 切片 C 换轴的**租户语义矩阵**（隔离硬轴 `organizationId →
 * tenantId`，同租跨组织默认互见）：无 session → **401**（会话墙先于租户墙）；有 session 但未 set-active（无
 * `activeOrganizationId`→派生不出活动租户）→ **403**（租户墙 fail-closed）；而 @TenantIsolationExempt 面（GET
 * /tenants）仅经会话墙、无活动租户亦 **200**（exempt 不回归）；**同租跨组织互见**（新默认）+ **跨租互不可见**
 *（硬边界）+ 越界写携伪造 body `organizationId`/`workspaceId`/`tenantId` 经严格管 **400** 拒入（切片 A′ 后与生产
 * 同装配）+ 伪造 `x-workspace-id` 选择器读恒 0 行（FR-5/NFR-1 红线）。
 *
 * 夹具换轴注：BA 原生 `createOrganization` 不盖 `tenantId`，而隔离主轴经活动组织派生 `tenantId`（
 * `TENANT_SCOPE_RESOLVER` 查 `organization.tenantId`）——缺租户行则 `requireActiveTenantId()` fail-closed 403。
 * 故 `createOrgAndActivate` 沿生产换轴写链（provisioning/seed）补建专属租户行并盖 `organization.tenantId`
 *（1:1·`tenant.id=org.id`）；同租场景可传 `existingTenantId` 令后续组织复用同租户。
 *
 * **默认跳过**：需一个已建好 schema 的真实 Postgres。仅当 `E2E_DATABASE_URL` 存在时运行（作开关），
 * 真正连接串取 `DATABASE_URL`（两者应指向同一个库），故不破默认 CI 的 DB-free 不变量。本地执行见
 * 文件末「本地跑法」注释（专用 `nestjs_e2e` 库·不污染 dev 数据）。夹具（用户/组织/帖子）在 afterAll
 * 显式清净，运行幂等（每次用时间戳后缀的唯一 email/slug）。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

const PASSWORD = 'E2e-Pa55w0rd!';

/** 从 better-auth `asResponse` 的 Response 头提取可回放的 `Cookie` 请求头（保 name=value 对）。 */
function toCookieHeader(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [h.get('set-cookie')];
  return list
    .filter((c): c is string => Boolean(c))
    .map((c) => c.split(';')[0])
    .join('; ');
}

interface Actor {
  readonly email: string;
  readonly userId: string;
  readonly cookie: string;
  orgId?: string;
}

gated('租户隔离全栈 e2e（真·Better Auth 登录编排 · 无认证桩 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;

  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdTenantIds: string[] = [];

  const authApi = () => app.get<InjectAuthInstance>(AuthInstanceInjectKey).get().api;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // B1 隔离（module-ci-gated-e2e-isolation·人 2026-10-17 令「同意」裁 B1）：把本进程 outbox 后台
      // 轮询循环节掉根——outbox 模式下 AppModule 每 pollMs 起全局 relay，与共享库的其它 gated 文件竞抢
      // event 行（跨进程互污竞态主体）。本文件断言不依赖后台投递；tenant-status-link「pollMs 拨大」为
      // 同方向进程内先例。override 于 init 前生效 = 零启动窗口。
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // 与生产入口同装配（global-ci-fullstack-pg 首跑拓出：无全局管时 @Query DTO 默认值失效 → limit undefined）。
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    if (createdOrgIds.length) {
      await em.nativeDelete(PostEntity, { organizationId: { $in: createdOrgIds } } as never);
      await em.nativeDelete(Member, { organizationId: { $in: createdOrgIds } } as never);
      await em.nativeDelete(Organization, { id: { $in: createdOrgIds } } as never);
    }
    if (createdTenantIds.length) {
      await em.nativeDelete(Tenant, { id: { $in: createdTenantIds } } as never);
    }
    if (createdUserIds.length) {
      await em.nativeDelete(Session, { userId: { $in: createdUserIds } } as never);
      await em.nativeDelete(Account, { userId: { $in: createdUserIds } } as never);
      await em.nativeDelete(User, { id: { $in: createdUserIds } } as never);
    }
    await app.close();
  });

  /** 真实注册 → 真实登录（服务端 API·取 BA 自签 session cookie）。userId 入清理名单。 */
  async function signUpThenSignIn(tag: string): Promise<Actor> {
    const email = `e2e-auth-${tag}-${stamp}@example.com`;
    const up = await authApi().signUpEmail({
      body: { name: `E2E ${tag}`, email, password: PASSWORD },
      asResponse: true,
    });
    if (up.status >= 400) throw new Error(`signUpEmail(${tag}) ${up.status}: ${await up.text()}`);
    const userId = String((await up.json()).user.id);
    createdUserIds.push(userId);

    const inRes = await authApi().signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    });
    if (inRes.status >= 400)
      throw new Error(`signInEmail(${tag}) ${inRes.status}: ${await inRes.text()}`);
    const cookie = toCookieHeader(inRes);
    if (!cookie) throw new Error(`signInEmail(${tag}) 未回 session cookie`);
    return { email, userId, cookie };
  }

  /**
   * 服务端系统动作建租户（申请人成 owner member）→ 换轴补建专属租户行盖 `organization.tenantId` →
   * set-active 落真实 session 的 activeOrganizationId。缺 `existingTenantId` 时新建 1:1 专属租户（tenant.id=org.id）；
   * 传入时复用已有租户（同租跨组织场景）。
   */
  async function createOrgAndActivate(
    actor: Actor,
    tag: string,
    existingTenantId?: string,
  ): Promise<{ orgId: string; tenantId: string }> {
    const created = await authApi().createOrganization({
      body: { name: `E2E Org ${tag}`, slug: `e2e-org-${tag}-${stamp}`, userId: actor.userId },
    });
    const orgId = String((created as { id?: unknown }).id);
    if (!orgId || orgId === 'undefined') throw new Error(`createOrganization(${tag}) 无 id`);
    createdOrgIds.push(orgId);
    actor.orgId = orgId;

    // 换轴：BA 不盖 tenantId → 隔离主轴派生不出租户。沿生产写链补建/复用租户行并盖 organization.tenantId，
    // 否则后续真 cookie 打 /posts 会被 requireActiveTenantId() fail-closed 403。
    const em = await mikro.fork();
    const tenantId = existingTenantId ?? orgId;
    if (!existingTenantId) {
      await em.insert(Tenant, {
        id: tenantId,
        name: `E2E Tenant ${tag}`,
        slug: `e2e-org-${tag}-${stamp}`,
        status: 'active',
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      createdTenantIds.push(tenantId);
    }
    await em.nativeUpdate(Organization, { id: orgId } as never, { tenantId } as never);

    const act = await authApi().setActiveOrganization({
      body: { organizationId: orgId },
      headers: { cookie: actor.cookie },
      asResponse: true,
    });
    if (act.status >= 400)
      throw new Error(`setActiveOrganization(${tag}) ${act.status}: ${await act.text()}`);
    return { orgId, tenantId };
  }

  const listPosts = (cookie?: string, extra?: Record<string, string>) =>
    app.inject({
      method: 'GET',
      url: '/posts',
      headers: { ...(cookie ? { cookie } : {}), ...(extra ?? {}) },
    });

  const createPost = (cookie: string, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/posts',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });

  it('无 session cookie → 全局会话墙 fail-closed 401（先于租户墙）', async () => {
    const res = await listPosts();
    expect(res.statusCode).toBe(401);
  });

  it('真实注册+登录→但未 set-active（无 activeOrganizationId）→ 全局租户墙 fail-closed 403', async () => {
    const lonely = await signUpThenSignIn('lonely');
    const res = await listPosts(lonely.cookie);
    expect(res.statusCode).toBe(403);
  });

  it('exempt 面不回归：有会话但未 set-active 打 @TenantIsolationExempt 的 GET /tenants → 200（仅经会话墙、无租户上下文亦放行）', async () => {
    // 与上测（同形状会话）的 /posts → 403 形成对照：证 exempt 装饰器仍令目录读面绕开租户墙（不回归）。
    const lonely = await signUpThenSignIn('exempt');
    const res = await app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { cookie: lonely.cookie },
    });
    expect(res.statusCode).toBe(200);
  });

  it('两租户各经真登录编排 → 真 cookie 打 /posts 跨租户互不可见', async () => {
    const a = await signUpThenSignIn('a');
    await createOrgAndActivate(a, 'a');
    const b = await signUpThenSignIn('b');
    await createOrgAndActivate(b, 'b');

    const pa = await createPost(a.cookie, { title: 'E2E-REAL-ALPHA', published: true });
    expect(pa.statusCode).toBe(201);
    const pb = await createPost(b.cookie, { title: 'E2E-REAL-BRAVO', published: true });
    expect(pb.statusCode).toBe(201);

    const la = await listPosts(a.cookie);
    expect(la.statusCode).toBe(200);
    expect(la.body).toContain('E2E-REAL-ALPHA');
    expect(la.body).not.toContain('E2E-REAL-BRAVO');

    const lb = await listPosts(b.cookie);
    expect(lb.statusCode).toBe(200);
    expect(lb.body).toContain('E2E-REAL-BRAVO');
    expect(lb.body).not.toContain('E2E-REAL-ALPHA');
  });

  it('同租跨组织互见（换轴新默认）：同租户下切至第二个组织仍可见首组织帖子', async () => {
    const a = await signUpThenSignIn('tw');
    // org1 伴生专属租户 T；发帖落入 T（写时 ALS 派生 tenantId=T）。
    const { tenantId } = await createOrgAndActivate(a, 'tw1');
    const p = await createPost(a.cookie, { title: 'E2E-SAME-TENANT', published: true });
    expect(p.statusCode).toBe(201);

    // 同一 actor 在同租户 T 下再挂 org2 并切为活动组织（organizationId 变、tenantId 不变）。
    await createOrgAndActivate(a, 'tw2', tenantId);
    const list = await listPosts(a.cookie);
    expect(list.statusCode).toBe(200);
    // 主轴为 tenantId 而非 organizationId → 同租跨组织默认互见（旧模按 organizationId 会盲）。
    expect(list.body).toContain('E2E-SAME-TENANT');
  });

  it('负向·越界写：真会话携伪造 body organizationId/workspaceId → 严格管 400 拒入，victim 租户仍不可见', async () => {
    const a = await signUpThenSignIn('w');
    await createOrgAndActivate(a, 'w');
    const victim = await signUpThenSignIn('victim');
    const { tenantId: victimTenantId } = await createOrgAndActivate(victim, 'victim');

    // 生产真相（切片 A′ 补齐全局管后订正断言）：CreatePostDto 无租户/组织/工作区字段，
    // whitelist+forbidNonWhitelisted 在 handler 前即 400 拒入——伪造 body 面（含换轴后的 tenantId）一律零受理。
    // 仓储层「强制盖可信租户」兜底仍由隔离单测锁（双防线：拒入在前、盖归属在后）。
    const res = await createPost(a.cookie, {
      title: 'E2E-REAL-WRITE-A',
      published: true,
      organizationId: victim.orgId,
      tenantId: victimTenantId,
      workspaceId: 'ws_forged',
    });
    expect(res.statusCode).toBe(400);

    // a 未因 400 创建成功；victim 租户**绝不应**看到这条试图伪造归属到它的帖子。
    const la = await listPosts(a.cookie);
    expect(la.body).not.toContain('E2E-REAL-WRITE-A');
    const lv = await listPosts(victim.cookie);
    expect(lv.body).not.toContain('E2E-REAL-WRITE-A');
  });

  it('负向·越界读：真会话携伪造 x-workspace-id 选择器不能括宽/泄漏（复合作用域 → 0 行）', async () => {
    const a = await signUpThenSignIn('r');
    await createOrgAndActivate(a, 'r');
    await createPost(a.cookie, { title: 'E2E-REAL-READ-A', published: true });

    const ok = await listPosts(a.cookie);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('E2E-REAL-READ-A');

    // 携任意 foreign ws 选择器后 (tenantA ∧ ws=foreign) 恒 0 行，证 organizationId 谓词恒取可信 ctx。
    const narrow = await listPosts(a.cookie, { 'x-workspace-id': 'ws_of_other_tenant' });
    expect(narrow.statusCode).toBe(200);
    expect(narrow.body).not.toContain('E2E-REAL-READ-A');
  });
});

/*
 * 本地跑法（专用 nestjs_e2e 库·不污染 dev 数据）：
 *   docker exec postgres-dev psql -U postgres -c "CREATE DATABASE nestjs_e2e;"            # 若不存在
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e pnpm run migration:run -- --fresh
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/tenant-isolation/tenant-isolation.e2e.test.ts
 *   docker exec postgres-dev psql -U postgres -c "DROP DATABASE nestjs_e2e;"              # 用完清理（可选）
 */

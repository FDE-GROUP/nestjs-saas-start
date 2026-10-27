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
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

/**
 * P0 安全缺陷修复 · **真·HTTP+ALS** 端到端反证（env-gated·无认证桩）。
 *
 * 立意为补齐「测试证明力错位」：既有 `tenant-activation.e2e` 全走直 `bus.execute` + 手
 * `tenantIsolationStorage.run`，从不让「真实会话 → 中间件绑 ALS → 全局 filter」这条链在同一次
 * 请求里成立——恰好放过了 X1/X2 两条 P0。本测把真实 Better Auth 登录链路整条跑起（服务端 API·
 * `asResponse:true` 取真 cookie），带真 cookie 打真实 Nest 路由（`app.inject`），令中间件经真实
 * `RequestSessionReader` 解析会话绑进 ALS，逐级过全局 `SessionGuard`/`TenantIsolationGuard` +
 * 仓储全局 filter——全程无认证桩。
 *
 * 覆盖两条 P0：
 *  - **X1 锁死链**：多租用户（同时是 T1/orgA 与 T2/orgB 成员）活动组织锚 orgA（ALS 绑 T1）打
 *    `GET /tenants`（@TenantIsolationExempt 只摘守卫、不摘 ALS→filter）→ 目录须**同时含 T1 与 T2**
 *    （修复后 `listForUser` 走 scoped:false）；随后 `PUT /tenants/active {T2}` → **200**（成员闸复用
 *    已修目录，切租可达）。修复前回绿后红：scoped fork 把 Organization 滤到 T1 → 目录只剩 T1 → 切 T2 恒 403。
 *  - **X2 租内提权**：u 在 T1/orgA 仅 `member`、在 T2/orgB 为 `owner`；DB 直造混态会话
 *    `{activeTenantId=T1, activeOrganizationId=orgB∈T2}` 打 `GET /organizations/roles`（@Can read Role）
 *    → **403**（中间件校 org∉tenant fail-closed·绝不借 orgB 的 owner 角色在 T1 行权）。对照：u 干净态
 *    （仅 active=orgB·无租位）打同端点 → **200**（合法 orgB owner）。修复前混态为 200（提权成立）。
 *
 * 换轴夹具注：BA `createOrganization` 不盖 `organization.tenantId`，隔离主轴经活动组织派生租户
 * （`TENANT_SCOPE_RESOLVER` 查 `organization.tenantId`）——故沿生产写链补建 1:1 专属租户行（tenant.id=org.id）
 * 并盖 tenantId，否则真 cookie 打租户级端点会被 fail-closed 403。
 *
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行·夹具 afterAll 清净·时间戳后缀保幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

const PASSWORD = 'E2e-Pa55w0rd!';

/** 从 better-auth `asResponse` 的 Response 头提取可回放的 `Cookie` 请求头。 */
function toCookieHeader(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [h.get('set-cookie')];
  return list
    .filter((c): c is string => Boolean(c))
    .map((c) => c.split(';')[0])
    .join('; ');
}

interface Actor {
  readonly userId: string;
  readonly cookie: string;
}

gated('P0 修复反证 e2e（X1 锁死 + X2 提权 · 真 HTTP+ALS · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;

  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdTenantIds: string[] = [];

  const authApi = () => app.get<InjectAuthInstance>(AuthInstanceInjectKey).get().api;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // 与 tenant-isolation.e2e 同纪律：节掉 outbox 后台轮询，避免共享库跨 gated 文件竞抢 event 行。
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork({ scoped: false });
    if (createdOrgIds.length) {
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
    const email = `e2e-p0-${tag}-${stamp}@example.com`;
    const up = await authApi().signUpEmail({
      body: { name: `E2E P0 ${tag}`, email, password: PASSWORD },
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
    return { userId, cookie };
  }

  /**
   * 服务端系统动作建组织（`userId` 成 owner member）→ 补建 1:1 专属租户行盖 tenantId →
   * 可选 `setActiveOrganization` 落真实 session 的 activeOrganizationId（`activate=false` 时不切活动组织）。
   */
  async function createOrg(
    actor: Actor,
    tag: string,
    activate = true,
  ): Promise<{ orgId: string; tenantId: string }> {
    const created = await authApi().createOrganization({
      body: { name: `E2E P0 ${tag}`, slug: `e2e-p0-${tag}-${stamp}`, userId: actor.userId },
    });
    const orgId = String((created as { id?: unknown }).id);
    if (!orgId || orgId === 'undefined') throw new Error(`createOrganization(${tag}) 无 id`);
    createdOrgIds.push(orgId);

    const em = await mikro.fork({ scoped: false });
    const tenantId = orgId; // 1:1 骨架：tenant.id = org.id
    await em.insert(Tenant, {
      id: tenantId,
      name: `E2E P0 T ${tag}`,
      slug: `e2e-p0-${tag}-${stamp}`,
      status: 'active',
      orgVisibility: 'shared',
      createdAt: new Date(),
      updatedAt: null,
    } as never);
    createdTenantIds.push(tenantId);
    await em.nativeUpdate(Organization, { id: orgId } as never, { tenantId } as never);

    if (activate) {
      const act = await authApi().setActiveOrganization({
        body: { organizationId: orgId },
        headers: { cookie: actor.cookie },
        asResponse: true,
      });
      if (act.status >= 400)
        throw new Error(`setActiveOrganization(${tag}) ${act.status}: ${await act.text()}`);
    }
    return { orgId, tenantId };
  }

  it('X1 锁死链：多租用户真会话打 GET /tenants → 目录同时含 T1 与 T2；PUT /tenants/active{T2} → 200（切租可达）', async () => {
    const u = await signUpThenSignIn('lockout');
    // orgA∈T1 并切为活动组织（ALS 派生绑 tenantId=T1）。
    const t1 = await createOrg(u, 'l1');
    // orgB∈T2（u owner）但不切活动组织（活动仍 orgA）→ 复刻「带会话且已绑活动租」打豁免目录面。
    const t2 = await createOrg(u, 'l2', false);

    const list = await app.inject({
      method: 'GET',
      url: '/tenants',
      headers: { cookie: u.cookie },
    });
    expect(list.statusCode).toBe(200);
    // 修复后目录走 scoped:false 绕 tenantId 全局 filter → 他租 orgB(∈T2) 不被滤掉。
    expect(list.body).toContain(t1.tenantId);
    expect(list.body).toContain(t2.tenantId);

    // 成员资格闸复用已修目录 → T2 现可见 → 切租不再恒 403（锁死解除）。
    const sw = await app.inject({
      method: 'PUT',
      url: '/tenants/active',
      headers: { cookie: u.cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ tenantId: t2.tenantId }),
    });
    expect(sw.statusCode).toBe(200);
  }, 60000);

  it('X2 租内提权：混态会话 {activeTenantId=T1, activeOrganizationId=orgB∈T2} 打 @Can read Role → 403（读侧 fail-closed）', async () => {
    const u = await signUpThenSignIn('esc');
    const ownerX = await signUpThenSignIn('escx');
    // orgA∈T1 归 ownerX（u 仅挂 member 行·T1 内非管理员）。
    const t1 = await createOrg(ownerX, 'esc1');
    const em = await mikro.fork({ scoped: false });
    await em.insert(Member, {
      id: `mem-${t1.orgId}-${u.userId}`,
      organizationId: t1.orgId,
      userId: u.userId,
      role: 'member',
      createdAt: new Date(),
    } as never);
    // orgB∈T2 归 u（owner·有 Role:read 职权）·并切活动组织为 orgB（session.activeOrganizationId=orgB）。
    await createOrg(u, 'esc2');

    // 对照：u 干净态（仅 active=orgB·无 activeTenantId）→ 合法 orgB owner → 200。
    const clean = await app.inject({
      method: 'GET',
      url: '/organizations/roles',
      headers: { cookie: u.cookie },
    });
    expect(clean.statusCode).toBe(200);

    // DB 直造混态（模拟历史/手改/服务端透传未清租位）：activeTenantId=T1·activeOrganizationId=orgB(∈T2) 仍留。
    const affected = await em.nativeUpdate(
      Session,
      { userId: u.userId } as never,
      { activeTenantId: t1.tenantId } as never,
    );
    expect(affected).toBeGreaterThan(0);

    // 中间件校 org∉tenant → fail-closed 不绑主轴 → 全局租户墙 403（绝不借 orgB 的 owner 角色在 T1 行权）。
    const mixed = await app.inject({
      method: 'GET',
      url: '/organizations/roles',
      headers: { cookie: u.cookie },
    });
    expect(mixed.statusCode).toBe(403);
  }, 60000);
});

/*
 * 本地跑法（专用 nestjs_e2e 库·不污染 dev 数据）：
 *   docker exec postgres-dev psql -U postgres -c "CREATE DATABASE nestjs_e2e;"            # 若不存在
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e pnpm run migration:run -- --fresh
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/tenant-isolation/p0-lockout-escalation.e2e.test.ts
 *   docker exec postgres-dev psql -U postgres -c "DROP DATABASE nestjs_e2e;"              # 用完清理（可选）
 */

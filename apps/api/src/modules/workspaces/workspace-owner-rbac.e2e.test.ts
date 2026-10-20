import 'reflect-metadata';
import { createValidationPipe } from '@app/common/validation-pipe';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { Account, Member, Organization, Session, User } from '@app/database/mikro/entities';
import { Workspace } from '@app/database/mikro/four-tables';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantRole, TenantRoleGrant, type TenantRoleRow } from '@app/database/mikro/rbac-tables';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { ListWorkspacesQueryHandler } from '@core/saas-kit/modules/workspaces/application/queries/handlers/list-workspaces.query-handler';
import { ListWorkspacesQuery } from '@core/saas-kit/modules/workspaces/application/queries/list-workspaces.query';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * Workspace 实例属主列 **全栈端到端演示**（module-workspace-owner-column 切片 B·env-gated）：
 * query 级片（module-rbac-query-level-filtering）当时只能单测锁形——本片在真库上兑现那笔缓账。
 *
 * 证真五向（盖章/伪造/列表均走真实 HTTP + 真 BA 会话）：
 * 1. **盖章**：A（owner·seed 无条件 read=kind all）POST /workspaces → 行落 `ownerId=A`
 *    （handler 从 ALS 会话取 userId·人裁③）；
 * 2. **伪造负例**：受限角色 B 经同端点 body 塞 `ownerId:'<A>'` → 严格白名单管 400 拒入
 *    （DTO 面只有 name/slug·伪造面为零）；
 * 3. **owner 自见**：B（org 自定义角色 `limited`·`{ownerId:'{{userId}}'}` 条件 grant）
 *    经真实 HTTP GET list → 见 wB 且仅 wB（人裁 A1 改判后 guard 入口级放行·行级仍由谓词下推）；
 * 4. **非 owner 盲**：B 的 list 不含 A 的 wA，也不含 `ownerId=NULL` 的系统行（人裁② fail-closed）；
 * 5. **all 全见**：A list → wA/wB/wNull 三行皆可见（类型级无条件授权不受 where 支影响）。
 *
 * 夹具注记：B 以 em 直插 member 行（role 先 'member' 后改 'limited'——同表同列，BA set-active
 * 只校验成员身份不锁 role 值），grant 经 `tenant_role`/`tenant_role_grant` 真实行（与
 * dynamic-roles 片仓储视图同形·不自造通道）；`ensureSystemRoles` 由 A 首次 check 触发，
 * 自定义 key 不在其辖内·不播种不回收。
 *
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行（开关），连接串取 `DATABASE_URL`——对齐
 * tenant-isolation.e2e.test.ts 的 gated 纪律；夹具 afterAll 清净，时间戳后缀保幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

const PASSWORD = 'E2e-Pa55w0rd!';

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
}

gated('Workspace 实例属主端到端（RBAC query 级 where 支真库兑现 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;

  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

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
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    if (createdOrgIds.length) {
      await em.nativeDelete(Workspace, { organizationId: { $in: createdOrgIds } } as never);
      await em.nativeDelete(TenantRoleGrant, {
        roleId: {
          $in: (await em.find(TenantRole, { organizationId: { $in: createdOrgIds } } as never)).map(
            (r) => (r as TenantRoleRow).id,
          ),
        },
      } as never);
      await em.nativeDelete(TenantRole, { organizationId: { $in: createdOrgIds } } as never);
      await em.nativeDelete(Member, { organizationId: { $in: createdOrgIds } } as never);
      await em.nativeDelete(Organization, { id: { $in: createdOrgIds } } as never);
    }
    if (createdUserIds.length) {
      await em.nativeDelete(Session, { userId: { $in: createdUserIds } } as never);
      await em.nativeDelete(Account, { userId: { $in: createdUserIds } } as never);
      await em.nativeDelete(User, { id: { $in: createdUserIds } } as never);
    }
    await app.close();
  });

  async function signUpThenSignIn(tag: string): Promise<Actor> {
    const email = `e2e-owner-${tag}-${stamp}@example.com`;
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

  const createWorkspace = (cookie: string, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });

  const listWorkspacesViaHandler = (ctx: {
    tenantId: string;
    userId?: string;
    role?: string;
  }): Promise<{ slug: string; ownerId?: string | null }[]> => {
    const handler = app.get(ListWorkspacesQueryHandler);
    const tenant = app.get(TenantContextService);
    return tenant
      .run(ctx, () => handler.execute(new ListWorkspacesQuery({ limit: 50, offset: 0 })))
      .then((page) => [...page.items]);
  };

  it('五向端到端：盖章 / 伪造 400 / owner 自见 / 非 owner 盲（含 NULL 行）/ all 全见', async () => {
    // — 编排：A 建租户（BA owner）→ B 入组（em member 行）→ B set-active → B 改挂自定义 limited 角色。
    const a = await signUpThenSignIn('a');
    const created = await authApi().createOrganization({
      body: { name: `E2E Org ${stamp}`, slug: `e2e-owner-org-${stamp}`, userId: a.userId },
    });
    const orgId = String((created as { id?: unknown }).id);
    if (!orgId || orgId === 'undefined') throw new Error(`createOrganization 无 id`);
    createdOrgIds.push(orgId);

    // A 也需 set-active（会话落 activeOrganizationId，否则租户墙 fail-closed 403·实跑自捕）。
    const actA = await authApi().setActiveOrganization({
      body: { organizationId: orgId },
      headers: { cookie: a.cookie },
      asResponse: true,
    });
    if (actA.status >= 400)
      throw new Error(`setActiveOrganization(a) ${actA.status}: ${await actA.text()}`);

    const b = await signUpThenSignIn('b');
    const em = await mikro.fork();
    await em
      .getDriver()
      .getConnection()
      .execute(
        `insert into "member" ("id", "organizationId", "userId", "role", "createdAt") values (?, ?, ?, ?, now())`,
        [uuidv7(), orgId, b.userId, 'member'],
      );

    const act = await authApi().setActiveOrganization({
      body: { organizationId: orgId },
      headers: { cookie: b.cookie },
      asResponse: true,
    });
    if (act.status >= 400)
      throw new Error(`setActiveOrganization(b) ${act.status}: ${await act.text()}`);

    // 自定义 limited 角色：create 无条件（类型级放行）+ read 带实例条件（where 支下推）。
    // 分两次 flush：运行时扁平实体无 relation 依赖序，同批会 grant 先于 role（FK 抢跑·实跑自捕）。
    const roleId = uuidv7();
    em.create(TenantRole, {
      id: roleId,
      organizationId: orgId,
      key: 'limited',
      name: 'Limited',
      isSystem: false,
      createdAt: new Date(),
      updatedAt: null,
    });
    await em.flush();
    em.create(TenantRoleGrant, {
      roleId,
      subject: 'Workspace',
      action: 'create',
      conditions: null,
      createdAt: new Date(),
    });
    em.create(TenantRoleGrant, {
      roleId,
      subject: 'Workspace',
      action: 'read',
      conditions: { ownerId: '{{userId}}' },
      createdAt: new Date(),
    });
    await em.flush();
    await em
      .getDriver()
      .getConnection()
      .execute(
        `update "member" set "role" = 'limited' where "organizationId" = ? and "userId" = ?`,
        [orgId, b.userId],
      );

    // — 1. 盖章：A 创建 wA（ownerId 由 handler 从 ALS 取会话值·不经 body）。

    const wA = await createWorkspace(a.cookie, { name: 'Alpha', slug: `alpha-${stamp}` });
    expect(wA.statusCode).toBe(201);
    expect((wA.json() as { data: { organizationId: string } }).data.organizationId).toBe(orgId);
    const rowA = await em.findOne(Workspace, { slug: `alpha-${stamp}` } as never);
    expect((rowA as { ownerId?: string | null } | null)?.ownerId).toBe(a.userId);

    // — 2. 伪造负例：body 塞 ownerId → 严格白名单 400（人裁③伪造面为零）。
    const forged = await createWorkspace(b.cookie, {
      name: 'Forged',
      slug: `forged-${stamp}`,
      ownerId: a.userId,
    });
    expect(forged.statusCode).toBe(400);

    // — B 正常创建 wB（limited 的 create 无条件行放行）。
    const wB = await createWorkspace(b.cookie, { name: 'Beta', slug: `beta-${stamp}` });
    expect(wB.statusCode).toBe(201);

    // — 系统路径 NULL 属主行（em 直插·无会话 userId 的同型形状）。
    em.create(Workspace, {
      id: uuidv7(),
      organizationId: orgId,
      name: 'System',
      slug: `sys-${stamp}`,
      ownerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await em.flush();

    // — 3+4. B（where 支）：自见 wB；盲 A 的 wA 与 NULL 行（人裁②）。
    // 改判存照（module-rbac-guard-instance-read·人 2026-10-17 令「同意」采 A1·仅 list 面）：guard 对
    // 纯实例受限角色的 read 入口级判定改委派 listPredicate——原「403 现状登记」断言翻正为真 HTTP 面：
    // 过门放行，行可见集仍由 where 支下推治理（自见·盲他人与 NULL）。
    const listB = await app.inject({
      method: 'GET',
      url: '/workspaces?limit=50',
      headers: { cookie: b.cookie },
    });
    expect(listB.statusCode).toBe(200);
    // 实测壳形（全链首测取证）：Page 无 meta 键→ TransformInterceptor 走普通包壳支，
    // 响应 = {data:{items,total,limit,offset},statusCode,message}。
    const slugsBHttp = (listB.json() as { data: { items: { slug: string }[] } }).data.items.map(
      (w) => w.slug,
    );
    expect(slugsBHttp).toEqual([`beta-${stamp}`]);

    const slugsB = (
      await listWorkspacesViaHandler({ tenantId: orgId, userId: b.userId, role: 'limited' })
    ).map((w) => w.slug);
    expect(slugsB).toEqual([`beta-${stamp}`]);

    // — 5. A（owner seed 无条件 read → kind all）：三行全见。
    const listA = await listWorkspacesViaHandler({
      tenantId: orgId,
      userId: a.userId,
      role: 'owner',
    });
    const slugsA = listA.map((w) => w.slug);
    expect(slugsA).toContain(`alpha-${stamp}`);
    expect(slugsA).toContain(`beta-${stamp}`);
    expect(slugsA).toContain(`sys-${stamp}`);
    // 全见面的 record 投影同带属主值（toRecord 接线实证）。
    expect(listA.find((w) => w.slug === `sys-${stamp}`)?.ownerId ?? null).toBeNull();
  }, 60000);
});

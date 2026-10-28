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
  TenantInvitation,
  TenantMembership,
  TenantRoleAssignment,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import {
  Invitation,
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import type { MikroQuotaStore } from '@app/modules/subscriptions/infrastructure/mikro-quota.store';
import { FREE_PLAN } from '@core/saas-kit/modules/subscriptions/quota/organization-plans';
import { QUOTA_STORE } from '@core/saas-kit/modules/subscriptions/quota/quota.store';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  healMemberCountDrift,
  type MemberCountDrift,
  scanMemberCountDrift,
} from '../../../../../scripts/member-count-doctor';
import { AppModule } from '../../app.module';

/**
 * 席位配额 **env-gated 全栈 e2e**（X7 租级化后的三段真相）：
 *
 * 1. **租级 SSOT 闭环（新轴主面）**：席位计量 = live `tenant_membership`（R2 换锚）——owner 经
 *    租级邀请端点（`POST /organizations/invitations` → `POST /organizations/invitations/accept`）
 *    逐个 accept 塞满免费档（`FREE_PLAN.seatsLimit`）后，第 N+1 人 accept → **402**（门面守卫）·
 *    live 计数零增长·超限邀请保持 pending（拒绝≠消费）。creator-join 沿生产 R1 写链同形补建。
 * 2. **旧 BA 通道 hook 已退役（R6·席位守卫单点归新轴门面）**：BA `seats-quota.hook` 删线后，
 *    直接打 `/organization/accept-invitation` **不再**于 accept 时点设席——本段钉锁退役边界：租级
 *    席位灌满后 BA accept **放行**（落 BA member 行·触发器补计观测轴），但 live SSOT
 *    （`tenant_membership`）零增长（BA 通道不写租级真相）。残留旁路=已知可接受（BA 旧 org
 *    通道属遗留面·新轴门面 `acceptInvitation` 为唯一卡点）。
 * 3. **X8 物化列/触发器/doctor（BA 轴过渡观测）**：`tenant.memberCount` 由库级触发器对 **BA member
 *    写入链**维护（含 `organization.tenantId` relink 补计与 UPDATE 支）——本文件恒等对拍改**直读物化列
 *    ≡ BA 两跳联表实数**（不再经 `store.countMembers`·后者已换租级 SSOT）；其最终存废随 **X8 契约段**
 *    （落库·须人签）裁定，在此之前观测链必须常绿（物化列若继续供给展示/诊断则触发器不可断）。
 *
 * 旧 BA 通道走服务端编排网关（`authApi().createInvitation/acceptInvitation`·S9 补遗同款范式）：
 * Test harness 不复现 main.ts 前缀/版本化装配，BA HTTP 端点在测试里无匹配 Nest 路由→中间件不触发
 *（tenant-isolation.e2e.test.ts 同因）；而 dispatch.mjs 明笔 auth.api.* 与 router 走同一 hooks
 * pipeline——R6 后该 pipeline 已不含 seats before-hook，故 BA accept 放行，本段据此钉锁退役边界。
 *
 * 换轴夹具注：BA `createOrganization` 不盖 `organization.tenantId`——沿生产写链补建 1:1 专属租户行
 * （tenant.id=org.id）并盖 tenantId + creator-join（R1 同形），否则门面解析不到目标租户→
 * 402 永不触发（实跑自捕）。
 *
 * **默认跳过**：需已建 schema 的真实 Postgres，仅 `E2E_DATABASE_URL` 存在时运行（开关），
 * 连接串取 `DATABASE_URL`——对齐 tenant-isolation.e2e.test.ts 的 gated 纪律，不破默认 CI DB-free 不变量。
 * 夹具（用户/org/member/invitation/租级三表行）afterAll 清净（租级行随 Tenant FK cascade），时间戳后缀保幂等。
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

gated('席位配额全栈 e2e（租级 SSOT + 旧 BA 通道 hook 退役边界 + X8 过渡观测 · env-gated）', () => {
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
    // 与生产入口同装配（global-ci-fullstack-pg 切片 A′：校验管单源见 common/validation-pipe.ts）。
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    if (createdOrgIds.length) {
      await em.nativeDelete(Invitation, { organizationId: { $in: createdOrgIds } } as never);
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

  async function signUpThenSignIn(tag: string): Promise<Actor> {
    const email = `e2e-seat-${tag}-${stamp}@example.com`;
    const up = await authApi().signUpEmail({
      body: { name: `E2E Seat ${tag}`, email, password: PASSWORD },
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

  /** owner 发邀请（服务端透传 createInvitation·HTTP path 为 invite-member·仍经 hooks pipeline）：只写 invitation 行·不动 seats。 */
  async function inviteMember(owner: Actor, orgId: string, email: string): Promise<string> {
    const res = await authApi().createInvitation({
      body: { email, role: 'member', organizationId: orgId },
      headers: { cookie: owner.cookie },
      asResponse: true,
    });
    if (res.status >= 400)
      throw new Error(`invite-member(${email}) ${res.status}: ${await res.text()}`);
    const id = String(((await res.json()) as { id?: unknown }).id);
    if (!id || id === 'undefined') throw new Error(`invite-member(${email}) 无 invitation id`);
    return id;
  }

  /** 被邀者接受邀请（member 行落行时点·hook 卡点所在）。 */
  async function acceptInvitation(actor: Actor, invitationId: string): Promise<Response> {
    return authApi().acceptInvitation({
      body: { invitationId },
      headers: { cookie: actor.cookie },
      asResponse: true,
    });
  }

  const countMembersBA = async (orgId: string) => {
    const em = await mikro.fork();
    return em.count(Member, { organizationId: orgId } as never);
  };

  /**
   * X8 物化列恒等对拍（**BA 轴过渡观测**口径）：直读物化列 `tenant.memberCount`（O(1)·触发器维护）≡
   * 两跳 BA 联表实数（`store.reconcileMembers`）≡ 期望值。本文件为 1:1 租户替身（tenant.id = org.id），
   * 真·BA 写入链各节点三值逐字相等（触发器常正确不变式）。注：席位真相已另归 `store.countMembers`
   * （live `tenant_membership`·R2 换锚），与本观测面正交。
   */
  const assertSeatIdentity = async (tenantId: string, expected: number) => {
    const store = app.get<MikroQuotaStore>(QUOTA_STORE);
    const em = await mikro.fork({ scoped: false });
    const tenant = await em.findOne(Tenant, { id: tenantId } as never);
    const materialized = (tenant as { memberCount?: number } | null)?.memberCount ?? null;
    const joined = await store.reconcileMembers(tenantId);
    expect(materialized, `物化列 tenant.memberCount(${tenantId})`).toBe(expected);
    expect(joined, `BA 联表实数(${tenantId})`).toBe(expected);
    expect(materialized, '物化 ≡ 联表（漂移即触发器失真）').toBe(joined);
  };

  /**
   * 建组织 + 补建 1:1 专属租户（tenant.id=org.id）+ creator-join（R1 生产写链同形：落租级成员
   * + owner 分配）+ setActive（会话落 activeOrganizationId·ALS 经组织派生租户），返回 tenantId。
   */
  async function createOrgFor(actor: Actor, tag: string): Promise<string> {
    const created = await authApi().createOrganization({
      body: {
        name: `E2E Seat ${tag} ${stamp}`,
        slug: `e2e-seat-o-${tag}-${stamp}`,
        userId: actor.userId,
      },
    });
    const orgId = String((created as { id?: unknown }).id);
    if (!orgId || orgId === 'undefined') throw new Error(`createOrganization(${tag}) 无 id`);
    createdOrgIds.push(orgId);
    const em = await mikro.fork({ scoped: false });
    await em.insert(Tenant, {
      id: orgId,
      name: `E2E Seat T ${tag} ${stamp}`,
      slug: `e2e-seat-t-${tag}-${stamp}`,
      status: 'active',
      createdAt: new Date(),
      updatedAt: null,
    } as never);
    createdTenantIds.push(orgId);
    await em.nativeUpdate(Organization, { id: orgId } as never, { tenantId: orgId } as never);
    await em.insert(TenantMembership, {
      id: `${orgId}-${actor.userId}-tm`,
      tenantId: orgId,
      userId: actor.userId,
      createdAt: new Date(),
      updatedAt: null,
    } as never);
    await em.insert(TenantRoleAssignment, {
      id: `${orgId}-${actor.userId}-tra`,
      tenantId: orgId,
      userId: actor.userId,
      roleKey: 'owner',
      createdAt: new Date(),
      updatedAt: null,
    } as never);
    const act = await authApi().setActiveOrganization({
      body: { organizationId: orgId },
      headers: { cookie: actor.cookie },
      asResponse: true,
    });
    if (act.status >= 400)
      throw new Error(`setActiveOrganization(${tag}) ${act.status}: ${await act.text()}`);
    return orgId;
  }

  it('租级席位闭环：tenant 邀请 accept 塞满免费档后第 N+1 人 402·live SSOT 零增长·超限邀请保持 pending', async () => {
    const owner = await signUpThenSignIn('t-owner');
    const tenantId = await createOrgFor(owner, 't');
    const store = app.get<MikroQuotaStore>(QUOTA_STORE);
    const limit = FREE_PLAN.seatsLimit.value; // S2：OrganizationPlan.seatsLimit 已 Quota VO 化
    // creator 占 1 席（R1 creator-join 镜像落租级表）。
    expect(await store.countMembers(tenantId)).toBe(1);

    /** owner 发租级邀请（真 HTTP·org-admin 端点·返空体）→ 受邀者经 mine 查回 id → accept 入租。 */
    async function inviteAndAccept(tag: string): Promise<{ status: number; body: string }> {
      const invitee = await signUpThenSignIn(tag);
      const inv = await app.inject({
        method: 'POST',
        url: '/organizations/invitations',
        headers: { cookie: owner.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ email: invitee.email, role: 'member' }),
      });
      if (inv.statusCode >= 400)
        throw new Error(`createInvitation(${tag}) ${inv.statusCode}: ${inv.body}`);
      // 发邀端点不带 id（生产口径）——受邀者跨租个人可见面 `invitations/mine` 查回。
      const mine = await app.inject({
        method: 'GET',
        url: '/organizations/invitations/mine',
        headers: { cookie: invitee.cookie },
      });
      if (mine.statusCode >= 400)
        throw new Error(`invitations/mine(${tag}) ${mine.statusCode}: ${mine.body}`);
      const rows = (mine.json() as { data?: { id?: string; tenantId?: string }[] }).data ?? [];
      const invitationId = String(rows.find((r) => r.tenantId === tenantId)?.id);
      if (!invitationId || invitationId === 'undefined')
        throw new Error(`invitations/mine(${tag}) 未回本租邀请行: ${mine.body}`);
      const acc = await app.inject({
        method: 'POST',
        url: '/organizations/invitations/accept',
        headers: { cookie: invitee.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ invitationId }),
      });
      return { status: acc.statusCode, body: acc.body };
    }

    // 塞满：(limit-1) 人逐个 accept 成功（未超限零误伤），live 席位达限。
    for (let i = 1; i < limit; i++) {
      const r = await inviteAndAccept(`m${i}`);
      expect(r.status, `第 ${i} 人 accept 应成功（body=${r.body}）`).toBeLessThan(400);
    }
    expect(await store.countMembers(tenantId)).toBe(limit);

    // 超限：第 N+1 人 accept → 门面守卫拒 402·席位零增长·邀请保持 pending（拒绝≠消费）。
    const over = await inviteAndAccept('overflow');
    expect(over.status).toBe(402);
    expect(over.body).toContain('Seat quota exceeded');
    expect(await store.countMembers(tenantId)).toBe(limit);
    const em = await mikro.fork({ scoped: false });
    const row = await em.findOne(TenantInvitation, {
      tenantId,
      email: `e2e-seat-overflow-${stamp}@example.com`,
    } as never);
    expect(row?.status).toBe('pending');
  }, 120000);

  it('席位 TOCTOU 原子化（G3）：used=limit-1 时两并发 accept 经 pg_advisory_xact_lock 仅一成一 402·live 不越 limit', async () => {
    const owner = await signUpThenSignIn('c-owner');
    const tenantId = await createOrgFor(owner, 'c');
    const store = app.get<MikroQuotaStore>(QUOTA_STORE);
    const limit = FREE_PLAN.seatsLimit.value;

    /** owner 发租级邀请（真 HTTP）→ 受邀者经 mine 查回 id（不 accept·留作并发靶）。 */
    async function seedPendingInvitation(
      tag: string,
    ): Promise<{ invitee: Actor; invitationId: string }> {
      const invitee = await signUpThenSignIn(tag);
      const inv = await app.inject({
        method: 'POST',
        url: '/organizations/invitations',
        headers: { cookie: owner.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ email: invitee.email, role: 'member' }),
      });
      if (inv.statusCode >= 400)
        throw new Error(`createInvitation(${tag}) ${inv.statusCode}: ${inv.body}`);
      const mine = await app.inject({
        method: 'GET',
        url: '/organizations/invitations/mine',
        headers: { cookie: invitee.cookie },
      });
      const rows = (mine.json() as { data?: { id?: string; tenantId?: string }[] }).data ?? [];
      const invitationId = String(rows.find((r) => r.tenantId === tenantId)?.id);
      if (!invitationId || invitationId === 'undefined')
        throw new Error(`invitations/mine(${tag}) 未回本租邀请行: ${mine.body}`);
      return { invitee, invitationId };
    }

    // 灌至 used=limit-1：creator(1) + (limit-2) 人逐个 accept 成功。
    for (let i = 1; i < limit - 1; i++) {
      const { invitee, invitationId } = await seedPendingInvitation(`c-m${i}`);
      const acc = await app.inject({
        method: 'POST',
        url: '/organizations/invitations/accept',
        headers: { cookie: invitee.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ invitationId }),
      });
      expect(acc.statusCode, `第 ${i} 人 accept 应成功（body=${acc.body}）`).toBeLessThan(400);
    }
    expect(await store.countMembers(tenantId), `灌至 limit-1=${limit - 1}`).toBe(limit - 1);

    // 并发抢最后 1 席：两独立受邀者各自 accept 两条不同 pending 邀请，`Promise.all` 同发。
    // 门面预检 `checkSeats` 非原子（两者皆见 used=limit-1·放行）→ 终裁入 admitAtomically 锁内串行：
    // 先者计数 limit-1→插成（live=limit）·后者锁重取见 limit→used+1>limit 回滚 overLimit（402）。
    const [a, b] = await Promise.all([
      seedPendingInvitation('c-x1'),
      seedPendingInvitation('c-x2'),
    ]);
    const results = await Promise.all(
      [a, b].map(({ invitee, invitationId }) =>
        app.inject({
          method: 'POST',
          url: '/organizations/invitations/accept',
          headers: { cookie: invitee.cookie, 'content-type': 'application/json' },
          payload: JSON.stringify({ invitationId }),
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    const okCount = codes.filter((c) => c < 400).length;
    const seatFull = codes.filter((c) => c === 402).length;
    expect(okCount, `仅一人抢到最后席位（codes=${codes.join(',')}）`).toBe(1);
    expect(seatFull, '另一人应 402 超限').toBe(1);
    expect(await store.countMembers(tenantId), 'live 席位恰至 limit·绝不越界').toBe(limit);
  }, 120000);

  it('旧 BA 通道 hook 已退役（R6 退役边界钉锁）：租级席位塞满后 BA accept-invitation 放行·BA member +1 但 live SSOT 零增长', async () => {
    const owner = await signUpThenSignIn('h-owner');
    const tenantId = await createOrgFor(owner, 'hook');
    const store = app.get<MikroQuotaStore>(QUOTA_STORE);
    const limit = FREE_PLAN.seatsLimit.value;

    // 直插租级成员灌满 live SSOT 至限（模拟租级入组已达限；BA 轴 member 行仍仅 owner auto-join 1 条）。
    const em = await mikro.fork({ scoped: false });
    for (let i = 1; i < limit; i++) {
      const u = await signUpThenSignIn(`h-m${i}`);
      await em.insert(TenantMembership, {
        id: `${tenantId}-${u.userId}-tm`,
        tenantId,
        userId: u.userId,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
    }
    expect(await store.countMembers(tenantId)).toBe(limit);
    expect(await countMembersBA(tenantId)).toBe(1);

    // R6 退役 seats hook 后，BA invite→accept 不再于 accept 时点设席——放行落 BA member 行。
    // 钉锁退役边界：BA 通道不写租级真相（live SSOT `tenant_membership` 零增长），席位守卫
    // 单点归新轴门面（测 1 实证 402）。残留旁路为已知可接受（BA 旧 org 通道属遗留面）。
    const extra = await signUpThenSignIn('h-overflow');
    const invitationId = await inviteMember(owner, tenantId, extra.email);
    const accepted = await acceptInvitation(extra, invitationId);
    const body = await accepted.text();
    expect(accepted.status, `BA accept 应放行（hook 已退役·body=${body}）`).toBeLessThan(400);
    expect(await countMembersBA(tenantId)).toBe(2);
    expect(await store.countMembers(tenantId)).toBe(limit);
  }, 120000);

  // ── 第三批 X8 追加：换组织恒等（证 X8-1 触发器 UPDATE OF organizationId 支）+ doctor 对拍自愈（X8-2）──

  /** 种独立租户行（tenant.id 自定·slug 唯一），登记清理；须早于任何 org 盖租（relink 触发器需租户在场才 +N）。 */
  async function seedTenant(tenantId: string, tag: string): Promise<void> {
    const em = await mikro.fork();
    await em.insert(Tenant, {
      id: tenantId,
      name: `E2E X8 Tenant ${tag}`,
      slug: `e2e-x8-t-${tag}-${stamp}`,
      status: 'active',
      createdAt: new Date(),
      updatedAt: null,
    } as never);
    createdTenantIds.push(tenantId);
  }

  /** 建组织（owner auto-join 1 member）并盖租到指定 tenantId（经 relink 触发器补计），返回 org/member id。 */
  async function seedOrgUnderTenant(
    tenantId: string,
    tag: string,
  ): Promise<{ orgId: string; memberId: string }> {
    const owner = await signUpThenSignIn(tag);
    const created = await authApi().createOrganization({
      body: { name: `E2E X8 Org ${tag}`, slug: `e2e-x8-o-${tag}-${stamp}`, userId: owner.userId },
    });
    const orgId = String((created as { id?: unknown }).id);
    if (!orgId || orgId === 'undefined') throw new Error(`createOrganization(${tag}) 无 id`);
    createdOrgIds.push(orgId);
    const em = await mikro.fork();
    await em.nativeUpdate(Organization, { id: orgId } as never, { tenantId } as never);
    const member = (await em.findOne(Member, { organizationId: orgId } as never)) as {
      id: string;
    } | null;
    if (!member) throw new Error(`seedOrgUnderTenant(${tag}) owner member 未落行`);
    return { orgId, memberId: member.id };
  }

  it('member 跨租换组织：旧租 −1 / 新租 +1 物化恒等（证 X8-1 触发器 UPDATE 支）', async () => {
    const tA = `x8a-${stamp}`;
    const tB = `x8b-${stamp}`;
    await seedTenant(tA, 'a');
    await seedTenant(tB, 'b');
    const orgA = await seedOrgUnderTenant(tA, 'a');
    const orgB = await seedOrgUnderTenant(tB, 'b');
    await assertSeatIdentity(tA, 1);
    await assertSeatIdentity(tB, 1);

    // 跨租迁移：仅改 organizationId（无 member 增删行）→ UPDATE OF organizationId 触发器须 −旧租 +新租；
    // 若漏本支（切片 5 原状）则物化不动而联表实数已变 → assertSeatIdentity 物化≡联表红（少算侧 fail-open 隐患）。
    const em = await mikro.fork();
    await em.nativeUpdate(
      Member,
      { id: orgA.memberId } as never,
      { organizationId: orgB.orgId } as never,
    );
    await assertSeatIdentity(tA, 0);
    await assertSeatIdentity(tB, 2);

    // 同租换组织净 0：两组织共一租、成员在两组织间迁移 → 本租总数不变（防误加/误减双计）。
    const tS = `x8s-${stamp}`;
    await seedTenant(tS, 's');
    const sA = await seedOrgUnderTenant(tS, 's-a');
    const sB = await seedOrgUnderTenant(tS, 's-b');
    await assertSeatIdentity(tS, 2);
    await em.nativeUpdate(
      Member,
      { id: sA.memberId } as never,
      { organizationId: sB.orgId } as never,
    );
    await assertSeatIdentity(tS, 2);
  }, 120000);

  it('member-count doctor：scan 检出遗留漂移 → heal 回写联表真相 → 复扫为空（X8-2 全链）', async () => {
    const tId = `x8doc-${stamp}`;
    await seedTenant(tId, 'doc');
    await seedOrgUnderTenant(tId, 'doc');
    await assertSeatIdentity(tId, 1);

    const em = await mikro.fork();
    // 造遗留漂移：直写物化列为错误值（绕过 member/org 触发器——模拟历史脏写/漏路径存量）。
    await em.nativeUpdate(Tenant, { id: tId } as never, { memberCount: 7 } as never);

    const drift = await scanMemberCountDrift(em);
    const hit = drift.find((d) => d.id === tId);
    expect(hit, 'scan 应检出被直写脏化的租户').toBeTruthy();
    expect(hit?.materialized).toBe(7);
    expect(hit?.truth).toBe(1);

    const healed = await healMemberCountDrift(em, [hit as MemberCountDrift]);
    expect(healed).toBe(1);

    const rescan = await scanMemberCountDrift(em);
    expect(
      rescan.find((d) => d.id === tId),
      'heal 后复扫不应再含该租',
    ).toBeUndefined();
    // heal 写值=联表真相 → 物化恒等复原（scan/heal 全链自证）。
    await assertSeatIdentity(tId, 1);
  }, 120000);
});

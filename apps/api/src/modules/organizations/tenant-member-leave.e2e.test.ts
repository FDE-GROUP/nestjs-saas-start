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
  TenantMembership,
  TenantRoleAssignment,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import type { MikroQuotaStore } from '@app/modules/subscriptions/infrastructure/mikro-quota.store';
import { QUOTA_STORE } from '@core/saas-kit/modules/subscriptions/quota/quota.store';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * 自助退租撤权撤席 **env-gated 全栈 e2e**（切片 G·G1·P1 真回归修复的证明面）。
 *
 * 立意为补齐第四轮评估锁定的 **P1 leave 撤权失效**：换轴后角色从 `tenant_role_assignment` 解、可见性/
 * 席位从 `tenant_membership` 解，而旧 `POST /organizations/members/leave` 仍为 BA passthrough（仅删 BA
 * `member` 行）→ 自我退租者**保留全部租级职权 + 可见可切租**（hand-off to nowhere）。本测把真实登录链路
 * 整条跑起（服务端 API 取真 cookie），带真 cookie 打真实 Nest 路由（`app.inject`），令中间件经真实会话
 * 绑 ALS（活动 org 派生租户）→ 门面 `leaveSelf` 经统一撤销原语 `revokeMembership` 撤租级两表 + 属主侧
 * `removeAcrossTenant` 连清 BA `member`——逐级证实：
 *  ① `tenant_membership`/`tenant_role_assignment` 两行消失；② BA `member` 行消失（双轴同步·闭 P3 失同步）；
 *  ③ live `countMembers`（席位真相 = `tenant_membership`·R2 换锚）−1（撤席·释放）；
 *  ④ 退租者对该租 `@Can read Member` fail-closed 403（撤权·租级分配已清）；
 *  ⑤ 唯一 owner 自助退租被拒 403（last-owner 闸）。
 *
 * 夹具沿生产 R1 写链同形：BA `createOrganization` 不盖 `organization.tenantId`，故补建 1:1 专属租户行
 * （tenant.id=org.id）+ creator-join（租级成员 + owner 分配），否则门面解析不到目标租 / 创建者拿不到职权。
 * 被退成员以两轴同形补种（BA `member` + 租级 `tenant_membership`/`tenant_role_assignment`）——退租须双轴清干净。
 *
 * **默认跳过**：需已建 schema 的真实 Postgres，仅 `E2E_DATABASE_URL` 存在时运行·afterAll 清净·时间戳后缀保幂等。
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
  readonly userId: string;
  readonly cookie: string;
}

gated(
  '自助退租撤权撤席 e2e（G1·P1 修复：撤两表 + 连清 BA + 席位释放 + @Can 403 + last-owner 拒 · env-gated）',
  () => {
    let app: NestFastifyApplication;
    let mikro: MikroOrmService;

    const stamp = Date.now();
    const createdUserIds: string[] = [];
    const createdOrgIds: string[] = [];
    const createdTenantIds: string[] = [];

    const authApi = () => app.get<InjectAuthInstance>(AuthInstanceInjectKey).get().api;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        // 同 gated 纪律：节掉 outbox 后台轮询，避免共享库跨 gated 文件竞抢 event 行。
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
        // 租级两表随 Tenant FK cascade，仍显式清净以保险（时间戳后缀夹具行 id 已知形状）。
        await em.nativeDelete(TenantRoleAssignment, {
          tenantId: { $in: createdTenantIds },
        } as never);
        await em.nativeDelete(TenantMembership, { tenantId: { $in: createdTenantIds } } as never);
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
      const email = `e2e-leave-${tag}-${stamp}@example.com`;
      const up = await authApi().signUpEmail({
        body: { name: `E2E Leave ${tag}`, email, password: PASSWORD },
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
     * 建组织 + 补建 1:1 专属租户（tenant.id=org.id）+ creator-join（R1 生产写链同形）+ setActive，返 org/tenant id。
     */
    async function createOrgFor(
      actor: Actor,
      tag: string,
    ): Promise<{ orgId: string; tenantId: string }> {
      const created = await authApi().createOrganization({
        body: {
          name: `E2E Leave ${tag} ${stamp}`,
          slug: `e2e-leave-o-${tag}-${stamp}`,
          userId: actor.userId,
        },
      });
      const orgId = String((created as { id?: unknown }).id);
      if (!orgId || orgId === 'undefined') throw new Error(`createOrganization(${tag}) 无 id`);
      createdOrgIds.push(orgId);
      const tenantId = orgId;
      const em = await mikro.fork({ scoped: false });
      await em.insert(Tenant, {
        id: tenantId,
        name: `E2E Leave T ${tag} ${stamp}`,
        slug: `e2e-leave-t-${tag}-${stamp}`,
        status: 'active',
        orgVisibility: 'shared',
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      createdTenantIds.push(tenantId);
      await em.nativeUpdate(Organization, { id: orgId } as never, { tenantId } as never);
      await em.insert(TenantMembership, {
        id: `${tenantId}-${actor.userId}-tm`,
        tenantId,
        userId: actor.userId,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      await em.insert(TenantRoleAssignment, {
        id: `${tenantId}-${actor.userId}-tra`,
        tenantId,
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
      return { orgId, tenantId };
    }

    it('member 自助退租：撤租级两表 + 连清 BA member + live 席位 −1 + 退租者 @Can 403；唯一 owner 退租被拒 403', async () => {
      const owner = await signUpThenSignIn('owner');
      const { orgId, tenantId } = await createOrgFor(owner, 'own');
      const store = app.get<MikroQuotaStore>(QUOTA_STORE);
      expect(await store.countMembers(tenantId)).toBe(1); // creator-join 占 1 席

      // 补种第二轴同形的成员（BA member + 租级成员 + 非 owner 角色分配）。
      const member = await signUpThenSignIn('m2');
      const em = await mikro.fork({ scoped: false });
      await em.insert(Member, {
        id: `mem-${orgId}-${member.userId}`,
        organizationId: orgId,
        userId: member.userId,
        role: 'member',
        createdAt: new Date(),
      } as never);
      await em.insert(TenantMembership, {
        id: `${tenantId}-${member.userId}-tm`,
        tenantId,
        userId: member.userId,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      await em.insert(TenantRoleAssignment, {
        id: `${tenantId}-${member.userId}-tra`,
        tenantId,
        userId: member.userId,
        roleKey: 'member',
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      expect(await store.countMembers(tenantId)).toBe(2);

      // 成员把活动组织切至本租（会话落 activeOrganizationId → ALS 派生租户），方可自助退租。
      const act = await authApi().setActiveOrganization({
        body: { organizationId: orgId },
        headers: { cookie: member.cookie },
        asResponse: true,
      });
      if (act.status >= 400) throw new Error(`member setActive ${act.status}: ${await act.text()}`);

      // ① 真 HTTP 打换轴后的 leave（facade.leaveSelf·经 ALS 活动租定位）。
      const leave = await app.inject({
        method: 'POST',
        url: '/organizations/members/leave',
        headers: { cookie: member.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ organizationId: orgId }),
      });
      expect(leave.statusCode, `leave 应 200（body=${leave.body}）`).toBe(200);

      // ①②③：租级两表消失 + BA member 消失 + live 席位 −1（撤权撤席双轴同步）。
      const after = await mikro.fork({ scoped: false });
      expect(
        await after.findOne(TenantMembership, { tenantId, userId: member.userId } as never),
        'tenant_membership 应已撤',
      ).toBeNull();
      expect(
        await after.findOne(TenantRoleAssignment, { tenantId, userId: member.userId } as never),
        'tenant_role_assignment 应已撤',
      ).toBeNull();
      expect(
        await after.findOne(Member, { organizationId: orgId, userId: member.userId } as never),
        'BA member 应连清（双轴同步）',
      ).toBeNull();
      expect(await store.countMembers(tenantId), 'live 席位应 −1').toBe(1);

      // ④：退租者对该租 `@Can read Member` → fail-closed 403（租级分配已清·绝不留职权）。
      const denied = await app.inject({
        method: 'GET',
        url: '/organizations/members',
        headers: { cookie: member.cookie },
      });
      expect(denied.statusCode, '退租者对该租 @Can 应 403').toBe(403);

      // ⑤：唯一 owner 自助退租被拒 403（last-owner 闸·防清空属主锁死）。
      const ownerLeave = await app.inject({
        method: 'POST',
        url: '/organizations/members/leave',
        headers: { cookie: owner.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ organizationId: orgId }),
      });
      expect(ownerLeave.statusCode, '唯一 owner 退租应被拒 403').toBe(403);
      // 拒退不改判：owner 两表 + 席位纹丝不动。
      expect(await store.countMembers(tenantId)).toBe(1);
      const stillOwner = await after.findOne(TenantRoleAssignment, {
        tenantId,
        userId: owner.userId,
      } as never);
      expect((stillOwner as { roleKey?: string } | null)?.roleKey).toBe('owner');
    }, 120000);
  },
);

/*
 * 本地跑法（专用 nestjs_e2e 库·不污染 dev 数据）：
 *   docker exec postgres-dev psql -U postgres -c "CREATE DATABASE nestjs_e2e;"
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e pnpm run migration:run -- --fresh
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/modules/organizations/tenant-member-leave.e2e.test.ts
 */

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
  Invitation,
  Member,
  Organization,
} from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { FREE_PLAN } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { APIError } from 'better-auth/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * S7 收尾 · seats 配额 hook 接线的 **env-gated 全栈 e2e**（plan module-tenancy-quota-member-wiring）。
 *
 * 证真事项（单测给不了的两条）：
 * 1. **path 实证**：matcher 命中的是真实 HTTP 派发路径——BA 剥掉 basePath(`/api/v1/auth`) 后
 *    `context.path = '/organization/accept-invitation'`。若实证失败（不命中），第 N+1 个 accept
 *    将成功 2xx，测试即红——本文件就是 DoD「path 实证 + matcher 收紧」的载体。
 * 2. **商业闭环**：免费档（无订阅行回落 `FREE_PLAN.seatsLimit`）下 creator 占 1 席，
 *    invite→accept 塞满至限后，超出的 accept 被 hook 拒 **402** 且 member 行零增长。
 *
 * 走服务端编排网关（`authApi().createInvitation/acceptInvitation`·S9 补遗同款范式）：Test harness
 * 不复现 main.ts 的前缀/版本化装配，BA HTTP 端点在测试里无匹配 Nest 路由→中间件不触发→404
 *（tenant-isolation.e2e.test.ts 同因）；而 dispatch.mjs 注释明笔 **auth.api.* 与 router 走同一
 * hooks pipeline**——服务端调用同样过 seats 配额 hook，ctx.path 仍为 `/organization/accept-invitation`，
 * 证效与生产 HTTP 通道等价（仅绕开测试未装配的中间件层）。accept-invitation 为现网唯一真实入组通道。
 *
 * 超限断言用 `asResponse: true`：拿原生 Response（402）而非抛错，与 signUp/signIn 编排同款。
 *
 * **默认跳过**：需已建 schema 的真实 Postgres，仅 `E2E_DATABASE_URL` 存在时运行（开关），
 * 连接串取 `DATABASE_URL`——对齐 tenant-isolation.e2e.test.ts 的 gated 纪律，不破默认 CI DB-free 不变量。
 * 夹具（用户/org/member/invitation）afterAll 清净，时间戳后缀保幂等。
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

gated('seats 配额 hook 全栈 e2e（真·BA HTTP 入组通道 · env-gated）', () => {
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

  const countMembers = async (orgId: string) => {
    const em = await mikro.fork();
    return em.count(Member, { organizationId: orgId } as never);
  };

  it('免费档塞满后 accept-invitation 被 hook 拒 402，member 行零增长（path 实证 + 商业闭环）', async () => {
    const owner = await signUpThenSignIn('owner');
    const created = await authApi().createOrganization({
      body: { name: `E2E Seats Org ${stamp}`, slug: `e2e-seats-${stamp}`, userId: owner.userId },
    });
    const orgId = String((created as { id?: unknown }).id);
    if (!orgId || orgId === 'undefined') throw new Error(`createOrganization 无 id`);
    createdOrgIds.push(orgId);

    // creator 已占 1 席；免费档限额 = FREE_PLAN.seatsLimit
    const limit = FREE_PLAN.seatsLimit.value; // S2：TenantPlan.seatsLimit 已 Quota VO 化
    expect(await countMembers(orgId)).toBe(1);

    // 塞满：再入 (limit - 1) 人，逐个 invite→accept，全部应成功（未超限零误伤）
    for (let i = 1; i < limit; i++) {
      const invitee = await signUpThenSignIn(`m${i}`);
      const invitationId = await inviteMember(owner, orgId, invitee.email);
      const res = await acceptInvitation(invitee, invitationId);
      expect(
        res.status,
        `第 ${i} 人 accept 应成功（body=${await res.clone().text()}）`,
      ).toBeLessThan(400);
    }
    expect(await countMembers(orgId)).toBe(limit);

    // 超限：第 limit+1 人 accept → hook 拒 402（S7 语义=需升级档位），member 不增。
    // 实测服务端通道行为：hook 抛的 APIError 在 auth.api.* 调用面直接冒泡（asResponse 不拦），
    // 生产 HTTP 面则由 BA handler 层转 402 响应——两态都接，断言 status/message 同口径。
    const extra = await signUpThenSignIn('overflow');
    const overflowInvitationId = await inviteMember(owner, orgId, extra.email);
    let rejectedStatus: number;
    let rejectedText: string;
    try {
      const rejected = await acceptInvitation(extra, overflowInvitationId);
      rejectedStatus = rejected.status;
      rejectedText = await rejected.text();
    } catch (error) {
      expect(error).toBeInstanceOf(APIError);
      rejectedStatus = (error as APIError).status;
      rejectedText = (error as APIError).message ?? String(error);
    }
    expect(rejectedStatus).toBe(402);
    expect(rejectedText).toContain('Seat quota exceeded');
    expect(await countMembers(orgId)).toBe(limit);

    // 超限邀请保持 pending（hook 拒绝不等于消费）
    const em = await mikro.fork();
    const row = await em.findOne(
      Invitation,
      { id: overflowInvitationId, organizationId: orgId } as never,
      { fields: ['status'] },
    );
    expect(row?.status).toBe('pending');
  }, 120000);
});

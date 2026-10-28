import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { createValidationPipe } from '@app/common/validation-pipe';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type {
  McpTokenVerifier,
  VerifiedMcpCredential,
} from '@app/modules/auth/application/ports/mcp-token-verifier.port';
import { MCP_TOKEN_VERIFIER } from '@app/modules/auth/application/ports/mcp-token-verifier.port';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  Account,
  Session,
  User,
} from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { McpAccessToken } from '@app/modules/auth/infrastructure/entities/mcp-access-token.entity';
import { TenantMembership } from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * MCP 租级凭证闭环 **真库端到端**（module-mcp-agent-surface 切片 1 完成判据·env-gated）。
 *
 * 立项稿四负例逐证（管理面 + 消费面 verifier 真链）：
 *  ① **他租凭证拒绝**：U2（活动租 T2）revoke T1 凭证 → 404 `MCP:CREDENTIAL_NOT_FOUND`
 *    （属主+租双谓词不命中·存在性零泄露），且 U2 list 不可见 T1 行；
 *  ② **scope 空集零可用工具**：直插 `scopes=[]` 行 → verifier 放行但授权集为空
 *    （工具零化判据 `selectToolNames([])` 由 features 单测锁死，此处证空集行真库可验）；
 *  ③ **撤销即时生效**：verify 成功 → revoke 204 → 再 verify → 401 `MCP:CREDENTIAL_INVALID`
 *    （与不存在/过期三态同码防探测）；
 *  ④ **租户 suspend 联动失能**：凭证有效，`tenant.status=suspended` → 403
 *    `MCP:TENANT_SUSPENDED`（TenantStatusService 单源），恢复 active → 立即可用。
 *
 * 夹具沿 tenant-member-leave 同形：BA 真 signUp/signIn 取真 cookie（G5 单租缺省绑轴
 * 经 `tenant_membership`），REST 面 `app.inject` 裸路由路径（e2e app 不设全局前缀）。
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行·夹具 afterAll 清净·时间戳后缀保幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

const PASSWORD = 'E2e-Pa55w0rd!';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function toCookieHeader(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [h.get('set-cookie')];
  return list
    .filter((c): c is string => Boolean(c))
    .map((c) => c.split(';')[0])
    .join('; ');
}

gated(
  'MCP 凭证闭环四负例 e2e（切片 1 判据：他租拒绝/空 scope 零工具/撤销即时/suspend 联动 · env-gated）',
  () => {
    let app: NestFastifyApplication;
    let mikro: MikroOrmService;

    const stamp = Date.now();
    const createdUserIds: string[] = [];
    const createdTenantIds: string[] = [];

    interface Actor {
      userId: string;
      cookie: string;
      tenantId: string;
    }
    let u1: Actor; // ∈ T1
    let u2: Actor; // ∈ T2

    const authApi = () => app.get<InjectAuthInstance>(AuthInstanceInjectKey).get().api;
    const verifier = () => app.get<McpTokenVerifier>(MCP_TOKEN_VERIFIER);

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
      u1 = await provisionActor('t1');
      u2 = await provisionActor('t2');
    }, 120000);

    /** BA 真注册+登录 + 专属租户 + 租级成员（G5 单租缺省绑轴·无活动 org/租位亦可解析）。 */
    async function provisionActor(tag: string): Promise<Actor> {
      const email = `e2e-mcp-${tag}-${stamp}@example.com`;
      const up = await authApi().signUpEmail({
        body: { name: `E2E MCP ${tag}`, email, password: PASSWORD },
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
      const tenantId = uuidv7();
      const em = await mikro.fork({ scoped: false });
      await em.insert(Tenant, {
        id: tenantId,
        name: `E2E MCP T ${tag} ${stamp}`,
        slug: `e2e-mcp-t-${tag}-${stamp}`,
        status: 'active',
        orgVisibility: 'shared',
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      createdTenantIds.push(tenantId);
      await em.insert(TenantMembership, {
        id: `${tenantId}-${userId}-tm`,
        tenantId,
        userId,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      await em.flush();
      return { userId, cookie, tenantId };
    }

    afterAll(async () => {
      if (!app) return;
      const em = await mikro.fork({ scoped: false });
      const allUserIds = [u1?.userId, u2?.userId].filter((v): v is string => Boolean(v));
      if (allUserIds.length) {
        await em.nativeDelete(McpAccessToken, { userId: { $in: allUserIds } } as never);
      }
      if (createdTenantIds.length) {
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

    /** REST mint 真链（ALS 盖章在本租），返回 {id, 明文 token}。 */
    async function mintViaRest(
      actor: Actor,
      name = `cli-${stamp}`,
    ): Promise<{ id: string; token: string }> {
      const res = await app.inject({
        method: 'POST',
        url: '/mcp/credentials',
        headers: { cookie: actor.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ name, scopes: ['read'] }),
      });
      expect(res.statusCode, `mint 应 201（body=${res.body}）`).toBe(201);
      const body = res.json();
      expect(body.data.token).toMatch(/^mcp_[0-9a-f]{64}$/);
      expect(body.data.tokenHash).toBeUndefined(); // 白名单序列化：哈希永不出面
      return { id: String(body.data.id), token: String(body.data.token) };
    }

    /** 直插伪造凭证行（绕 REST 校验面构造空 scopes/过期等 REST 面不可 mint 的形态）。 */
    async function forgeRow(
      actor: Actor,
      plain: string,
      over: { scopes?: string[]; expiresAt?: Date } = {},
    ): Promise<void> {
      const em = await mikro.fork({ scoped: false });
      const now = new Date();
      await em.insert(McpAccessToken, {
        id: uuidv7(),
        tenantId: actor.tenantId,
        userId: actor.userId,
        name: 'forge',
        tokenHash: sha256(plain),
        tokenPrefix: plain.slice(0, 12),
        scopes: over.scopes ?? ['read'],
        expiresAt: over.expiresAt ?? new Date(now.getTime() + 86400000),
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      } as never);
      await em.flush();
    }

    it('①他租凭证拒绝：U2 revoke T1 凭证 → 404 存在性零泄露·U2 list 不可见 T1 行', async () => {
      const { id, token } = await mintViaRest(u1);
      expect((await verifier().verify(token)).tenantId).toBe(u1.tenantId); // 凭证=租户单源
      const denied = await app.inject({
        method: 'DELETE',
        url: `/mcp/credentials/${id}`,
        headers: { cookie: u2.cookie },
      });
      expect(denied.statusCode, '他租撤销应 404').toBe(404);
      expect(denied.json().errorCode).toBe(ERROR_CODES.MCP_CREDENTIAL_NOT_FOUND);
      const foreignList = await app.inject({
        method: 'GET',
        url: '/mcp/credentials',
        headers: { cookie: u2.cookie },
      });
      expect(foreignList.statusCode).toBe(200);
      expect(foreignList.json().data.items).toEqual([]); // 跨租凭证在 list 面不存在
    }, 60000);

    it('③撤销即时生效 + 三态防探测：verify OK → revoke 204 → 401·lastUsedAt 已置位', async () => {
      const { id, token } = await mintViaRest(u1);
      await verifier().verify(token); // 首用成功（touch 记账）
      const em0 = await mikro.fork({ scoped: false });
      expect(
        await em0.findOne(McpAccessToken, { tokenHash: sha256(token) } as never, {
          fields: ['lastUsedAt'] as never,
        }),
      ).toMatchObject({ lastUsedAt: expect.any(Date) });
      const rev = await app.inject({
        method: 'DELETE',
        url: `/mcp/credentials/${id}`,
        headers: { cookie: u1.cookie },
      });
      expect(rev.statusCode, '属主撤销应 204').toBe(204);
      const err = await verifier()
        .verify(token)
        .catch((e: unknown) => e);
      const body = (
        err as { getResponse(): { statusCode: number; errorCode: string } }
      ).getResponse();
      expect(body.statusCode).toBe(401);
      expect(body.errorCode).toBe(ERROR_CODES.MCP_CREDENTIAL_INVALID);
      // 三态同码：未知 token 与已撤销凭证外部不可区分（防探测）。
      const ghost = await verifier()
        .verify('mcp_' + '0'.repeat(64))
        .catch((e: unknown) => e);
      expect((ghost as { getResponse(): { errorCode: string } }).getResponse().errorCode).toBe(
        ERROR_CODES.MCP_CREDENTIAL_INVALID,
      );
    }, 60000);

    it('②scope 空集：空授权凭证真库可验但授权集为零（工具零化判据由单测锁）', async () => {
      const plain =
        `mcp_${(stamp + Math.random()).toString(16).replace('.', '')}0000000000000000000000000000`.slice(
          0,
          68,
        );
      await forgeRow(u1, plain, { scopes: [] });
      const v: VerifiedMcpCredential = await verifier().verify(plain);
      expect(v.scopes).toEqual([]); // deny-by-default 消费面：空集行有效但零授权
    }, 60000);

    it('④suspend 联动失能：租封禁 403 → 恢复 active 立即可用（TenantStatusService 单源）', async () => {
      const { token } = await mintViaRest(u1, `susp-${stamp}`);
      const em = await mikro.fork({ scoped: false });
      await em.nativeUpdate(Tenant, { id: u1.tenantId } as never, { status: 'suspended' });
      const err = await verifier()
        .verify(token)
        .catch((e: unknown) => e);
      const body = (
        err as { getResponse(): { statusCode: number; errorCode: string } }
      ).getResponse();
      expect(body.statusCode).toBe(403);
      expect(body.errorCode).toBe(ERROR_CODES.MCP_TENANT_SUSPENDED);
      await em.nativeUpdate(Tenant, { id: u1.tenantId } as never, { status: 'active' });
      await expect(verifier().verify(token)).resolves.toMatchObject({ tenantId: u1.tenantId });
    }, 60000);

    it('⑤已过期凭证：与不存在/已撤同码 401（三态合一·deny-by-default）', async () => {
      const plain = `mcp_${(stamp * 2).toString(16)}00000000000000000000000000000000`.slice(0, 68);
      await forgeRow(u1, plain, { expiresAt: new Date(Date.now() - 1000) });
      const err = await verifier()
        .verify(plain)
        .catch((e: unknown) => e);
      expect((err as { getResponse(): { errorCode: string } }).getResponse().errorCode).toBe(
        ERROR_CODES.MCP_CREDENTIAL_INVALID,
      );
    }, 60000);
  },
);

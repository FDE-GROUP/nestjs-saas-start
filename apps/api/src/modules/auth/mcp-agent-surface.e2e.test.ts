import 'reflect-metadata';
import { createHash } from 'node:crypto';
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
import { McpAccessToken } from '@app/modules/auth/infrastructure/entities/mcp-access-token.entity';
import {
  TenantMembership,
  TenantRoleAssignment,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * MCP Agent **执行面真库端到端**（module-mcp-agent-surface 切片 2 完成判据·env-gated）。
 *
 * 与切片 1 `mcp-credentials.e2e.test.ts`（管理面 + verifier 直链）正交：本片验 **bearer 消费面全链**
 * ——真 MCP 客户端（官方 SDK `StreamableHTTPClientTransport`）经 **真 HTTP socket** 打 `/mcp`，覆盖
 * 立项稿 §2.2 鉴权链 + 只读两工具面：
 *  ① **scope 可见面**：owner 凭证（`scopes=['read']`）`tools/list` 恰回两读工具，写工具 `workspace.create`
 *    不在面（裁定乙「首批降只读」的对外兑现·调用亦被拒）；空 scope 集凭证→服务端不挂 tools 能力
 *    （`listTools` 直返 `-32601`·deny-by-default 协议面兑现）；
 *  ② **tenant.directory 真数据**：派既有 `ListTenantDirectoryQuery`→仓储真库回该用户可见租（成员资格收敛）；
 *  ③ **posts.list 跨租硬地板 + 免活动组织**：读闸乙裁（`readScope`）——bearer 无会话组织仍可租级读，
 *    且谓词恒含 `tenantId`：T1 凭证只见 T1 帖、绝不见 T2 帖（跨租地板不放宽）；
 *  ④ **越权负例**（真 HTTP 状态码对拍·不靠 SDK 包装）：假 bearer→401 `MCP:CREDENTIAL_INVALID`；
 *    凭证有效但租内**无角色分配行**（`resolveTenantRole` 解不出）→403 fail-closed（对齐中间件同单源）。
 *
 * 夹具沿 mcp-credentials 同形（BA 真 signUp/signIn 取真 cookie + 专属租 + 租成员），**额外**落
 * `tenant_role_assignment`（消费面 `buildScope` 经 `resolveTenantRole` 需角色行·非 `tenant_membership`）
 * 与 `organization`（`post.organizationId` 物理 FK）。真 SDK 往返须**实听端口**（`app.listen(0)`）——
 * transport 走 fetch/hijack 原生流，非 `app.inject` 的模拟 req/res。默认跳过：仅 `E2E_DATABASE_URL`
 * 存在时运行·夹具 afterAll 清净·时间戳后缀保幂等。DB 集成测试落**归属上下文**（auth 属主·features 零深引）。
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

/** 初始化 JSON-RPC 帧（负例走裸 fetch·不经 SDK 客户端包装，以取纯净 HTTP 状态码）。 */
const INITIALIZE_FRAME = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-surface', version: '0.0.0' },
  },
});

gated(
  'MCP 执行面真库 e2e（切片 2 判据：scope 可见面/租轴读通/跨租硬地板/越权负例 · env-gated）',
  () => {
    let app: NestFastifyApplication;
    let mikro: MikroOrmService;
    let base = '';

    const stamp = Date.now();
    const createdUserIds: string[] = [];
    const createdTenantIds: string[] = [];
    const createdOrgIds: string[] = [];

    interface Actor {
      userId: string;
      cookie: string;
      tenantId: string;
      orgId: string;
      token: string;
    }
    let u1: Actor; // ∈ T1（owner）
    let u2: Actor; // ∈ T2（owner）
    let u1WriteToken = ''; // u1 额外 write scope 凭证（写工具 workspace.create 用）
    let orphanUserId = ''; // 真用户但 T1 内无角色分配行（越权负例用）
    let orphanToken = ''; // 指向 orphan 用户的有效凭证（消费面应 403）

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
      // 真 SDK 往返须实听端口（transport 走 fetch/hijack 原生流·非 inject 模拟面）；0=内核分配空闲口。
      await app.listen(0, '127.0.0.1');
      base = (await app.getUrl()).replace('0.0.0.0', '127.0.0.1');
      mikro = app.get(MikroOrmService);
      u1 = await provisionActor('t1');
      u2 = await provisionActor('t2');
      orphanUserId = await provisionOrphanUser();
      // u1 额外铸一张 write scope 凭证（写工具面回归判据⑦）。
      u1WriteToken = await mintViaRest({ cookie: u1.cookie }, ['read', 'write']);
      await seedPosts();
    }, 120000);

    /** BA 真注册+登录 + 专属租 + 租成员 + 租级角色行（消费面 buildScope 需）+ 1:1 归属组织（post FK）。 */
    async function provisionActor(tag: string): Promise<Actor> {
      const email = `e2e-mcp-surf-${tag}-${stamp}@example.com`;
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
      const orgId = `e2e-mcp-surf-org-${tag}-${stamp}`;
      const em = await mikro.fork({ scoped: false });
      await em.insert(Tenant, {
        id: tenantId,
        name: `E2E MCP Surf ${tag} ${stamp}`,
        slug: `e2e-mcp-surf-${tag}-${stamp}`,
        status: 'active',
        orgVisibility: 'shared',
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      createdTenantIds.push(tenantId);
      await em.insert(Organization, {
        id: orgId,
        tenantId,
        name: `E2E MCP Surf Org ${tag}`,
        slug: `e2e-mcp-surf-org-${tag}-${stamp}`,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      createdOrgIds.push(orgId);
      await em.insert(TenantMembership, {
        id: `${tenantId}-${userId}-tm`,
        tenantId,
        userId,
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      await em.insert(TenantRoleAssignment, {
        id: `${tenantId}-${userId}-tra`,
        tenantId,
        userId,
        roleKey: 'owner',
        createdAt: new Date(),
        updatedAt: null,
      } as never);
      // BA `member` 行（org 轴成员·生产经 Better Auth 入组织必有）：`listForUser` 的 `organizations` 子集
      // 仅按此派生（非 tenant_membership），workspace.create 租属校验「写入集⊆发现集」依赖其在册。
      await em.insert(Member, {
        id: `${orgId}-${userId}-bm`,
        organizationId: orgId,
        userId,
        role: 'owner',
        createdAt: new Date(),
      } as never);
      await em.flush();

      // REST mint 真链（ALS 在本租盖章），回明文 token。
      const token = await mintViaRest({ cookie });
      return { userId, cookie, tenantId, orgId, token };
    }

    /** 真注册一个用户（有账号，可在 mcp_access_token 的 user FK 下铸证），但**不给任何租内角色行**。 */
    async function provisionOrphanUser(): Promise<string> {
      const email = `e2e-mcp-surf-orphan-${stamp}@example.com`;
      const up = await authApi().signUpEmail({
        body: { name: 'E2E MCP Orphan', email, password: PASSWORD },
        asResponse: true,
      });
      if (up.status >= 400) throw new Error(`signUpEmail(orphan) ${up.status}: ${await up.text()}`);
      const userId = String((await up.json()).user.id);
      createdUserIds.push(userId);
      // 直插一张指向 u1 租、属 orphan 用户的有效凭证（scopes=read·无角色分配行→消费面 403）。
      const plain = `mcp_orphan${stamp.toString(16)}${'0'.repeat(40)}`.slice(0, 68);
      const now = new Date();
      const em = await mikro.fork({ scoped: false });
      await em.insert(McpAccessToken, {
        id: uuidv7(),
        tenantId: u1.tenantId,
        userId,
        name: 'orphan',
        tokenHash: sha256(plain),
        tokenPrefix: plain.slice(0, 12),
        scopes: ['read'],
        expiresAt: new Date(now.getTime() + 86400000),
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      } as never);
      await em.flush();
      orphanToken = plain;
      return userId;
    }

    /** 铸凭证（REST 面·ALS 盖本租），回明文 token（缺省只读·写工具面传 `['read','write']`）。 */
    async function mintViaRest(
      actor: { cookie: string },
      scopes: readonly string[] = ['read'],
    ): Promise<string> {
      const res = await app.inject({
        method: 'POST',
        url: '/mcp/credentials',
        headers: { cookie: actor.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ name: `surf-${stamp}`, scopes }),
      });
      expect(res.statusCode, `mint 应 201（body=${res.body}）`).toBe(201);
      const token = String(res.json().data.token);
      expect(token).toMatch(/^mcp_[0-9a-f]{64}$/);
      return token;
    }

    /** 每租播种可辨识帖子：T1 两帖、T2 一帖（跨租地板断言·读闸乙裁免活动组织）。 */
    async function seedPosts(): Promise<void> {
      const em = await mikro.fork({ scoped: false });
      await em.insert(
        PostEntity,
        [
          {
            id: uuidv7(),
            title: `e2e-mcp-surf-t1-a-${stamp}`,
            tenantId: u1.tenantId,
            organizationId: u1.orgId,
          },
          {
            id: uuidv7(),
            title: `e2e-mcp-surf-t1-b-${stamp}`,
            tenantId: u1.tenantId,
            organizationId: u1.orgId,
          },
          {
            id: uuidv7(),
            title: `e2e-mcp-surf-t2-c-${stamp}`,
            tenantId: u2.tenantId,
            organizationId: u2.orgId,
          },
        ].map((p) => ({
          ...p,
          content: null,
          published: true,
          workspaceId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })) as never,
      );
      await em.flush();
    }

    afterAll(async () => {
      if (!app) return;
      const em = await mikro.fork({ scoped: false });
      const allUserIds = [u1?.userId, u2?.userId, orphanUserId].filter((v): v is string =>
        Boolean(v),
      );
      if (createdOrgIds.length) {
        await em.nativeDelete(PostEntity, { organizationId: { $in: createdOrgIds } } as never);
      }
      if (allUserIds.length) {
        await em.nativeDelete(McpAccessToken, { userId: { $in: allUserIds } } as never);
      }
      if (createdTenantIds.length) {
        await em.nativeDelete(TenantRoleAssignment, {
          tenantId: { $in: createdTenantIds },
        } as never);
        await em.nativeDelete(TenantMembership, { tenantId: { $in: createdTenantIds } } as never);
      }
      if (createdOrgIds.length) {
        await em.nativeDelete(Member, { organizationId: { $in: createdOrgIds } } as never);
        await em.nativeDelete(Organization, { id: { $in: createdOrgIds } } as never);
      }
      if (createdTenantIds.length) {
        await em.nativeDelete(Tenant, { id: { $in: createdTenantIds } } as never);
      }
      if (allUserIds.length) {
        await em.nativeDelete(Session, { userId: { $in: allUserIds } } as never);
        await em.nativeDelete(Account, { userId: { $in: allUserIds } } as never);
        await em.nativeDelete(User, { id: { $in: allUserIds } } as never);
      }
      await app.close();
    });

    /** 持凭证连一真 MCP 客户端（SDK over 实听 socket）。调用方负责 close。 */
    async function connectAs(token: string): Promise<Client> {
      const client = new Client({ name: 'e2e-surface', version: '0.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      });
      await client.connect(transport);
      return client;
    }

    /** 从 `content[0].text` 解 JSON（工具回执形制）。 */
    function parseText(res: unknown): unknown {
      const content = (res as { content: { type: string; text: string }[] }).content;
      return JSON.parse(content[0].text);
    }

    it('①scope 可见面：owner 凭证 tools/list 恰回两读工具·写工具不在面且不可调', async () => {
      const client = await connectAs(u1.token);
      try {
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual(['posts.list', 'tenant.directory']);
        // 裁定乙「首批降只读」对外兑现：写工具既不列出亦不可调。
        const denied = await client
          .callTool({ name: 'workspace.create', arguments: { name: 'x' } })
          .catch(() => ({ isError: true as const }));
        expect((denied as { isError?: boolean }).isError).toBe(true);
      } finally {
        await client.close();
      }
    }, 60000);

    it('②空 scope 集：凭证有效但零授权→服务端不挂 tools 能力（deny-by-default 对外兑现）', async () => {
      const plain = `mcp_empty${stamp.toString(16)}${'0'.repeat(44)}`.slice(0, 68);
      const now = new Date();
      const em = await mikro.fork({ scoped: false });
      await em.insert(McpAccessToken, {
        id: uuidv7(),
        tenantId: u1.tenantId,
        userId: u1.userId,
        name: 'empty-scope',
        tokenHash: sha256(plain),
        tokenPrefix: plain.slice(0, 12),
        scopes: [],
        expiresAt: new Date(now.getTime() + 86400000),
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      } as never);
      await em.flush();
      const client = await connectAs(plain);
      try {
        // 零工具注册时 SDK 服务端**不挂 tools 能力**（`McpServer` 仅在≥1 工具时装 tools/list 处理器）：
        // `listTools` 直返 `-32601 Method not found`——此即空 scope「零可用工具」在协议面的真实兑现（实跑坐实）。
        await expect(client.listTools()).rejects.toThrow(/-32601|Method not found/);
      } finally {
        await client.close();
      }
    }, 60000);

    it('③tenant.directory 真数据：派既有 query→仓储真库回该用户可见租', async () => {
      const client = await connectAs(u1.token);
      try {
        const res = await client.callTool({ name: 'tenant.directory', arguments: {} });
        const entries = parseText(res) as { tenantId: string }[];
        expect(entries.map((e) => e.tenantId)).toContain(u1.tenantId);
        expect(entries.map((e) => e.tenantId)).not.toContain(u2.tenantId); // 可见面按 userId 收敛
      } finally {
        await client.close();
      }
    }, 60000);

    it('④posts.list 跨租硬地板 + 免活动组织（读闸乙裁）：T1 凭证只见 T1 帖、绝不见 T2 帖', async () => {
      const client = await connectAs(u1.token);
      try {
        // bearer 消费面无会话组织——若读闸仍硬调 requireActiveOrganizationId 即 403（旧残留）；
        // readScope 收口后租级读放行，且谓词恒含 tenantId → 只见本租两帖。
        const res = await client.callTool({ name: 'posts.list', arguments: { limit: 20 } });
        const page = parseText(res) as { items: { title: string }[] };
        const titles = page.items.map((i) => i.title).sort();
        expect(titles).toEqual([`e2e-mcp-surf-t1-a-${stamp}`, `e2e-mcp-surf-t1-b-${stamp}`]);
        expect(titles).not.toContain(`e2e-mcp-surf-t2-c-${stamp}`); // 跨租硬地板不放宽
      } finally {
        await client.close();
      }
    }, 60000);

    it('⑤越权负例（裸 fetch·纯 HTTP 状态码）：假 bearer→401·无角色凭证→403 fail-closed', async () => {
      const bad = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { authorization: 'Bearer mcp_deadbeef', 'content-type': 'application/json' },
        body: INITIALIZE_FRAME,
      });
      expect(bad.status).toBe(401);
      expect(((await bad.json()) as { errorCode?: string }).errorCode).toBe(
        ERROR_CODES.MCP_CREDENTIAL_INVALID,
      );

      // 凭证本体有效，但租内无角色分配行→buildScope 解不出角色→403（对齐中间件同单源 fail-closed）。
      const noRole = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${orphanToken}`, 'content-type': 'application/json' },
        body: INITIALIZE_FRAME,
      });
      expect(noRole.status).toBe(403);
      expect(((await noRole.json()) as { errorCode?: string }).errorCode).toBe(
        ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
      );
    }, 60000);

    it('⑥超限入参被闸拦：limit>100 绝不静默按大页返数据', async () => {
      const client = await connectAs(u1.token);
      try {
        const res = await client
          .callTool({ name: 'posts.list', arguments: { limit: 1000 } })
          .catch(() => ({ isError: true as const }));
        // SDK inputSchema（max 100）在派发前拦下：要么 JSON-RPC 错误要么 isError 回执——不得回正常帖页。
        expect((res as { isError?: boolean }).isError).toBe(true);
      } finally {
        await client.close();
      }
    }, 60000);

    it('⑦写工具回归（切片 3 人裁甲）：write 凭证列三工具·workspace.create 真库落行三盖章·跨租 org 拒', async () => {
      // 写凭证面：tools/list 现回三工具（workspace.create 对 write scope 可见）。
      const wc = await connectAs(u1WriteToken);
      try {
        const { tools } = await wc.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual([
          'posts.list',
          'tenant.directory',
          'workspace.create',
        ]);
      } finally {
        await wc.close();
      }
      // 只读凭证仍不见写工具（裁定乙对外口径未因回归而泄）。
      const rc = await connectAs(u1.token);
      try {
        const { tools } = await rc.listTools();
        expect(tools.map((t) => t.name)).not.toContain('workspace.create');
      } finally {
        await rc.close();
      }

      const wsSlug = `e2e-mcp-surf-ws-${stamp}`;
      const client = await connectAs(u1WriteToken);
      try {
        // 正向：显式选本租组织 u1.orgId→ALS 补 org 轴→仓储双盖章落行。
        const ok = parseText(
          await client.callTool({
            name: 'workspace.create',
            arguments: { name: 'E2E Surf WS', slug: wsSlug, organizationId: u1.orgId },
          }),
        ) as { slug?: string; organizationId?: string; tenantId?: string; ownerId?: string };
        expect(ok.slug).toBe(wsSlug);
        // 真库对拍：tenantId/organizationId/ownerId 三盖章齐备（跨租地板+可信会话属主）。
        const em = await mikro.fork({ scoped: false });
        const row = await em
          .getRepository(Workspace)
          .findOne({ slug: wsSlug, organizationId: u1.orgId } as never);
        expect(row?.tenantId).toBe(u1.tenantId);
        expect(row?.organizationId).toBe(u1.orgId);
        expect(row?.ownerId).toBe(u1.userId);

        // 负向：organizationId 属他租（u2.orgId）→租属校验拒（runTool 折成 isError·不泄存在性）。
        const denied = await client
          .callTool({
            name: 'workspace.create',
            arguments: { name: 'X', slug: `e2e-mcp-surf-ws-x-${stamp}`, organizationId: u2.orgId },
          })
          .catch(() => ({ isError: true as const }));
        expect((denied as { isError?: boolean }).isError).toBe(true);
      } finally {
        await client.close();
      }
    }, 60000);
  },
);

/*
 * 本地跑法（沿用租户隔离 e2e 专用库先例·库须已含 mcp_access_token/tenant/organization/post 表）：
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_practice \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_practice \
 *     pnpm exec vitest run apps/api/src/modules/auth/mcp-agent-surface.e2e.test.ts
 *   （目标库须已应用迁移；夹具自清，运行幂等。）
 */

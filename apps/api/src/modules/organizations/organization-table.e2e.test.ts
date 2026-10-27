import 'reflect-metadata';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * 第三次层级复裁 · 切片 6 **库级 DDL 正证**（env-gated 真库）。
 *
 * 本测前身是 `organization.status` 列语义的唯一实据面（rehierarchy 片二 K1）；切片 6（D3）已把
 * 该自撰域列连同 `organization_status_check` **DROP**（治理真相单一锥归位 `tenant.status`·租内 org
 * 不再持有准入态），故本文件**换形**为切片 6 三项 DDL 契约的库级正证——单测/mock 证不了列缺席与
 * 约束生效，唯有真库能坐实：
 *  1. **D3**：`organization.status` 列已从物理表消失（`information_schema` 查无此列·CHECK 随之消解）；
 *  2. **D5-b**：`organization (tenantId, slug)` 联合唯一——同租内 slug 互斥、**跨租同名 slug 不再互斥**
 *     （层级 Tenant ⊃ Org 语义·本段收紧 contract）；
 *  3. **D5-a**：`tenant.slug` **全局唯一**——跨租撞 slug 即红（早先 expand 段不预支，本段加约束）。
 *
 * 约束违例经裸 SQL 直插即时暴露（PG 错误信息含约束名）；夹具时间戳后缀保幂等·afterAll 显式清净。
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行，不破默认 CI 的 DB-free 不变量。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated(
  '切片6 库级 DDL 正证（org.status 退役 · org(tenantId,slug) 唯一 · tenant.slug 全局唯一 · env-gated）',
  () => {
    let app: NestFastifyApplication;
    let mikro: MikroOrmService;

    const stamp = Date.now();
    const tenantId = uuidv7();
    const tenant2 = uuidv7();
    const orgT1 = uuidv7();
    const orgT2 = uuidv7();
    const orgSlug = `s6-org-${stamp}`;

    /** PostgreSQL 驱动对 SELECT 直返行数组，个别封装返回 `{ rows }`——两态统一取首行。 */
    const firstRow = (raw: unknown): Record<string, unknown> =>
      (Array.isArray(raw) ? raw[0] : ((raw as { rows?: unknown[] }).rows ?? [])[0]) as Record<
        string,
        unknown
      >;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(OutboxRelay)
        .useValue({
          onApplicationBootstrap: () => {},
          onModuleDestroy: () => {},
          tickOnce: async () => 0,
        })
        .compile();
      // 必须建真实 Fastify 应用（同 organization-hard-delete.e2e 先例）：AppModule 的 AuthBootstrapService
      // 在 onApplicationBootstrap 挂 BA 原生路由，裸 TestingModule.init() 下 `httpAdapter.getInstance()`
      // 为 undefined 会崩；无需 listen。
      app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      await app.init();
      mikro = app.get(MikroOrmService);

      // 夹具：两租（不同 slug）+ 每租各一 org 共用同一 org slug（证跨租 slug 互不互斥·D5-b 正例）。
      const em = await mikro.fork({ scoped: false });
      await em.insert(Tenant, [
        { id: tenantId, name: `S6 T1 ${stamp}`, slug: `s6-t1-${stamp}`, createdAt: new Date() },
        { id: tenant2, name: `S6 T2 ${stamp}`, slug: `s6-t2-${stamp}`, createdAt: new Date() },
      ] as never);
      const conn = em.getConnection();
      await conn.execute(
        `insert into "organization" ("id", "tenantId", "name", "slug", "createdAt") values (?, ?, ?, ?, now())`,
        [orgT1, tenantId, `S6 O1 ${stamp}`, orgSlug],
      );
      await conn.execute(
        `insert into "organization" ("id", "tenantId", "name", "slug", "createdAt") values (?, ?, ?, ?, now())`,
        [orgT2, tenant2, `S6 O2 ${stamp}`, orgSlug],
      );
      await em.flush();
    }, 120000);

    afterAll(async () => {
      if (!app) return;
      const em = await mikro.fork({ scoped: false });
      await em.nativeDelete(Organization, { id: { $in: [orgT1, orgT2] } } as never);
      await em.nativeDelete(Tenant, { id: { $in: [tenantId, tenant2] } } as never);
      await app.close();
    });

    it('D3：organization.status 物理列已 DROP（治理真相单一锥 tenant.status）', async () => {
      const em = await mikro.fork({ scoped: false });
      const raw = await em
        .getConnection()
        .execute(
          `select count(*)::int as c from information_schema.columns where table_name = 'organization' and column_name = 'status'`,
        );
      expect(firstRow(raw).c).toBe(0);
    }, 60000);

    it('D5-b：同租内 organization (tenantId,slug) 唯一违例即红（organization_tenantId_slug_unique）', async () => {
      const em = await mikro.fork({ scoped: false });
      await expect(
        em
          .getConnection()
          .execute(
            `insert into "organization" ("id", "tenantId", "name", "slug", "createdAt") values (?, ?, ?, ?, now())`,
            [uuidv7(), tenantId, `S6 dup ${stamp}`, orgSlug],
          ),
      ).rejects.toThrow(/organization_tenantId_slug_unique/);
    }, 60000);

    it('D5-b 正例：跨租同名 slug 互不互斥（两租各一 org 同 slug 共存）', async () => {
      const em = await mikro.fork({ scoped: false });
      const c = await em.count(Organization, {
        slug: orgSlug,
        id: { $in: [orgT1, orgT2] },
      } as never);
      expect(c).toBe(2);
    }, 60000);

    it('D5-a：撞既有 tenant.slug 全局唯一即红（跨租同 slug 互斥·tenant_slug_unique）', async () => {
      const em = await mikro.fork({ scoped: false });
      await expect(
        em
          .getConnection()
          .execute(`insert into "tenant" ("id", "name", "slug") values (?, ?, ?)`, [
            uuidv7(),
            `S6 slug dup ${stamp}`,
            `s6-t1-${stamp}`,
          ]),
      ).rejects.toThrow(/tenant_slug_unique/);
    }, 60000);
  },
);

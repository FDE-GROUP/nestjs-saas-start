import type { BasePostgreSqlEntityManager as PgEntityManager } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initMigrationOrm } from './mikro-migration.config';

/**
 * G4 R4 结构闭合迁移的**真库回放**（env-gated·直接驱动已交付工件 `Migration20261028150000_backfill_null_tenant_orgs`）。
 *
 * 证 plan G4 判据三段（离线迁移专用 ORM 连接·与运行中 app 解耦·零全局副作用）：
 *  - **up 自动 re-parent**：`organization.tenantId IS NULL` 的骨架 org（含 owner 成员）→ 合成 1:1 专属租
 *    （`tenant.id=org.id`·status='active'·slug 带 `-x7r4-<id>` 哨兵）+ 盖 tenantId（relink 触发器补计
 *    `memberCount`）+ 据 BA `member` 补 `tenant_membership`/`tenant_role_assignment`（成员可解角色·不再 403）；
 *  - **memberCount 对拍**：合成租 `memberCount` ≡ 该 org BA member 实数（触发器权威）；
 *  - **down 可逆**：复位 `organization.tenantId=NULL` → 删合成租派生 membership/role → 删合成 `tenant`（仅哨兵者）。
 *
 * 经 `migrator.down/up({ migrations: [NAME] })` 精确重放单条迁移（down 置 pending → 播场景 → up 应用 → 断言 →
 * down 逆向 → 清场景 → 末次 up 复位置回基线账本·全 gated 文件共库下不遗留状态）。
 *
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行·连接串取 `DATABASE_URL`·场景 afterAll 清净·时间戳后缀保幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

const MIGRATION_NAME = 'Migration20261028150000_backfill_null_tenant_orgs';

type Row = Record<string, unknown> | null;

gated(
  'G4 NULL-tenant org re-parent 迁移回放（up 自动盖租补成员角色 · down 可逆 · env-gated）',
  () => {
    let orm: Awaited<ReturnType<typeof initMigrationOrm>> | undefined;
    // 访问器代置非空断言（gate 文件仅 `E2E_DATABASE_URL` 在时跑·beforeAll 必已初始化 orm）。
    const db = () => {
      if (!orm) throw new Error('G4 回放 ORM 未初始化（beforeAll 未跑）');
      return orm;
    };

    const stamp = Date.now();
    const orgId = `g4-org-${stamp}`;
    const userId = `g4-user-${stamp}`;
    const memberId = `g4-mem-${stamp}`;
    const orgSlug = `g4-o-${stamp}`;

    // 离线迁移 ORM 的 em 泛参塌为基类·`execute` 需 PG 驱动签名（沿 G3 admitAtomically 双转口径·纯读回放无写面守卫触及）。
    const raw = (): PgEntityManager => db().em as unknown as PgEntityManager;
    const run = async (sql: string, params: unknown[] = []): Promise<void> => {
      await raw().execute(sql, params, 'run');
    };
    const get = async (sql: string, params: unknown[] = []): Promise<Row> => {
      // PG 驱动 `get` 无行时返 `undefined`·归一为 `null`以统一「行应不存在」断言口径。
      return ((await raw().execute(sql, params, 'get')) as Row | undefined) ?? null;
    };

    const seedScenario = async () => {
      await run(
        `insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
       values (?, ?, ?, true, now(), now())`,
        [userId, 'G4 Owner', `g4-${stamp}@e2e.test`],
      );
      await run(
        `insert into "organization" ("id", "tenantId", "name", "slug", "createdAt", "updatedAt")
       values (?, null, ?, ?, now(), null)`,
        [orgId, `G4 Org ${stamp}`, orgSlug],
      );
      await run(
        `insert into "member" ("id", "organizationId", "userId", "role", "createdAt")
       values (?, ?, ?, 'owner', now())`,
        [memberId, orgId, userId],
      );
    };
    const cleanScenario = async () => {
      await run(`delete from "member" where "id" = ?`, [memberId]).catch(() => undefined);
      await run(`delete from "organization" where "id" = ?`, [orgId]).catch(() => undefined);
      await run(`delete from "user" where "id" = ?`, [userId]).catch(() => undefined);
    };

    beforeAll(async () => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('G4 回放需 DATABASE_URL');
      orm = await initMigrationOrm(url);
    }, 120000);

    afterAll(async () => {
      if (!orm) return;
      // 末态复位：清场景 + 确保迁移回到「已应用」基线（空场景 up 零副作用·账本恒等·不遗状态于共库后续 gated 文件）。
      await cleanScenario();
      await orm.migrator.up({ migrations: [MIGRATION_NAME] }).catch(() => undefined);
      await orm.close();
    });

    it('up 自动 re-parent NULL-tenant 骨架 org（合成专属租 + 盖 tenantId + 补租级成员/角色·memberCount 对拍）·down 可逆', async () => {
      // 干净起点：把本迁移置为 pending（若基线已应用则逆向·当前无哨兵租 → 零副作用）。
      await db().migrator.down({ migrations: [MIGRATION_NAME] });

      await seedScenario();
      // 前置态：org 无租户归属（R4 症状根因）。
      expect(
        (await get(`select "tenantId" from "organization" where "id" = ?`, [orgId]))?.tenantId,
      ).toBe(null);

      // —— up：应用真工件 ——
      await db().migrator.up({ migrations: [MIGRATION_NAME] });

      // ① 1:1 专属租合成（id=org.id·status active·slug 带哨兵）。
      const org = await get(`select "tenantId" from "organization" where "id" = ?`, [orgId]);
      expect(org?.tenantId, 'organization 应 re-parent 至专属租（id=org.id）').toBe(orgId);
      const tenant = await get(
        `select "status", "memberCount", "slug" from "tenant" where "id" = ?`,
        [orgId],
      );
      expect(tenant?.status, '合成租 status 取 active（免新增审批门控）').toBe('active');
      expect(tenant?.slug).toBe(`${orgSlug}-x7r4-${orgId}`);
      // ② memberCount 对拍：relink 触发器把 BA member 实数补计（此场景 1 owner member）。
      const liveMember = await get(
        `select count(*)::int as c from "member" where "organizationId" = ?`,
        [orgId],
      );
      expect(Number(tenant?.memberCount), 'memberCount ≡ BA member 实数（触发器权威）').toBe(
        Number(liveMember?.c),
      );
      // ③ 租级成员/角色回填（成员自此可解角色·不再 403）。
      const tm = await get(`select "userId" from "tenant_membership" where "tenantId" = ?`, [
        orgId,
      ]);
      expect(tm?.userId, '应补 tenant_membership（成员入租）').toBe(userId);
      const ra = await get(
        `select "roleKey" from "tenant_role_assignment" where "tenantId" = ? and "userId" = ?`,
        [orgId, userId],
      );
      expect(ra?.roleKey, '应补 tenant_role_assignment·取最高权 owner').toBe('owner');

      // —— down：可逆（仅撤本次合成者）——
      await db().migrator.down({ migrations: [MIGRATION_NAME] });
      expect(
        (await get(`select "tenantId" from "organization" where "id" = ?`, [orgId]))?.tenantId,
        'down 应复位 organization.tenantId=NULL',
      ).toBeNull();
      expect(
        await get(`select "id" from "tenant" where "id" = ?`, [orgId]),
        'down 应删合成租',
      ).toBeNull();
      expect(
        await get(`select "id" from "tenant_membership" where "tenantId" = ?`, [orgId]),
        'down 应删派生租级成员',
      ).toBeNull();
      expect(
        await get(`select "id" from "tenant_role_assignment" where "tenantId" = ?`, [orgId]),
        'down 应删派生角色分配',
      ).toBeNull();
      // 既有 BA member/org 不被误伤（本迁移纯 DML·down 只撤合成者）。
      expect(
        await get(`select "id" from "member" where "id" = ?`, [memberId]),
        'down 不应误删 BA member',
      ).not.toBeNull();
    }, 120000);
  },
);

/*
 * 本地跑法（专用 nestjs_e2e 库·不污染 dev 数据）：
 *   docker exec postgres-dev psql -U postgres -c "CREATE DATABASE nestjs_e2e;"
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e pnpm run migration:run -- --fresh
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/database/mikro/migration/backfill-null-tenant-orgs.e2e.test.ts
 */

import 'reflect-metadata';
import { TransactionScope } from '@app/database/eventing/transaction-scope';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { Organization } from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { decodeCursor } from '@core/saas-kit/shared-kernel/domain/pagination';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MikroPostRepository } from './mikro-post.repository';

/**
 * 就绪预备 §2.3 #5 · 切片 B（戊=②）—— GET /posts 游标分页 **真库往返**（env-gated）。
 *
 * #3 甲档收口（module-p0-async-boundary-correctness 切片 B）：游标改以 **id 单键** keyset（`ORDER BY id DESC`·
 * 谓词 `id < cursorId`）。前提——`post.id` 为 **UUIDv7**（时间有序），其 ms 时间前缀使 id 序 ≡ createdAt 序（ms 级）。
 * 本测在真实 Postgres 上证明：多页翻取**无重无漏**、顺序恰为 `id DESC` 全序、`hasMore`/`nextCursor` 边界正确、
 * 畸形 cursor → 400 且**先于查库**。
 *
 * **关键回归面（证 #3 修好）**：夹具 rows 以 `em.insert(Post, [...])` 单语句插入且**不携 `createdAt`** →
 * DB 默认 `now()` 为**微秒**精度且事务内全行相等。旧复合游标对末项 `createdAt.toISOString()` 截去亚毫秒后，
 * 既不满足 `= cursorDate` 也不满足 `< cursorDate` → 同刻行成批静默丢（本文件旧版正是此盲区）；
 * id 单键无截断，同 µs 行仍能逐页翻尽。单测只能证谓词形状，此测证其与真 DB 比较语义对拍一致。
 *
 * 仅当 `E2E_DATABASE_URL` 存在且目标库**已含 post/organization 表**时运行；默认 CI 跳过、不触库
 * （DB-free 不变量）。Mikro 侧仅 `insert`/`find`/`nativeDelete` 读写、**不建表不迁移**（零 schema·不触高危#1）。
 * 夹具（org + posts）用时间戳唯一后缀，afterAll 显式清净（org 级联删 post），运行幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('posts 游标分页真库 e2e（切片 B · 戊=② · env-gated）', () => {
  let mikro: MikroOrmService;
  const stamp = Date.now();
  const orgId = `e2e-cursor-org-${stamp}`;

  // 6 行 uuidv7 id（时间有序）·**不携 createdAt**（靠 DB 默认 now()·单语句插入 → 全行同 µs）。
  // 这正是 #3 的回归面：同刻行在旧复合游标下会被整批静默丢；id 单键 keyset 应逐页翻尽。
  // 期望全序 = id DESC（与 createdAt 无关·id 唯一全序）。
  const ids = Array.from({ length: 6 }, () => uuidv7());
  // id 降序（ASCII 小写 hex text 比较·与 PG `ORDER BY id DESC` 同）作为期望序。
  const expectedOrder = [...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  beforeAll(async () => {
    mikro = new MikroOrmService(
      { getDatabaseConfig: () => ({ url: E2E_DB }) } as never,
      // ES Phase B 后半：真 TransactionScope（事务外 fork 行为不变）
      new TransactionScope(),
    );
    const em = await mikro.fork();
    await em.insert(Organization, { id: orgId, name: `E2E Cursor ${stamp}`, slug: orgId } as never);
    // 单语句多行 INSERT（不携 createdAt）→ DB 默认 now() 事务级恒定 → 六行 createdAt 逐 µs 相等（#3 回归面）。
    await em.insert(
      PostEntity,
      ids.map((id) => ({
        id,
        title: `cursor-${id}`,
        content: null,
        published: true,
        organizationId: orgId,
        workspaceId: null,
        updatedAt: new Date(),
      })) as never,
    );
  }, 120000);

  afterAll(async () => {
    if (!mikro) return;
    const em = await mikro.fork();
    // organization 级联（ON DELETE CASCADE）清 post；显式先删 post 更稳。
    await em.nativeDelete(PostEntity, { organizationId: orgId } as never);
    await em.nativeDelete(Organization, { id: orgId } as never);
    await mikro.onModuleDestroy();
  });

  function repo() {
    const fakeTenant = {
      requireTenantId: () => orgId,
      workspaceId: undefined,
    } as unknown as TenantContextService;
    return new MikroPostRepository(mikro, fakeTenant);
  }

  it('逐页翻取：无重无漏·全序 id 降序（同 µs createdAt 不丢行·证 #3）', async () => {
    const r = repo();
    const collected: string[] = [];
    let cursor: string | undefined;
    let guard = 0;

    // 以 limit=2 遍历全部 6 行 → 恰 3 页。六行 createdAt 全相等（同 µs）——旧复合游标会在此丢同刻行。
    for (;;) {
      if (guard++ > 10) throw new Error('游标遍历未收敛（疑似死循环）');
      const page = await r.list({ limit: 2, ...(cursor ? { cursor } : {}) });
      // 仓储 list 恒返已落库实例（id 非空·与 application toPostReadModel 同口径取断言）
      collected.push(...page.items.map((i) => i.id as string));
      if (!page.hasMore) {
        expect(page.nextCursor).toBeUndefined();
        break;
      }
      expect(page.nextCursor).toBeDefined();
      cursor = page.nextCursor;
    }

    expect(collected).toHaveLength(6);
    // 无重
    expect(new Set(collected).size).toBe(6);
    // 无漏（集等于播种全 id）
    expect([...collected].sort()).toEqual([...ids].sort());
    // 精确全序：id DESC（#3 甲档——同刻行依 id 逐页翻尽、不丢）
    expect(collected).toEqual(expectedOrder);
  });

  it('首页 limit 大于总量 → 一次取尽·hasMore=false·无 nextCursor', async () => {
    const page = await repo().list({ limit: 20 });
    expect(page.items).toHaveLength(6);
    expect(page.hasMore).toBe(false);
    expect('nextCursor' in page).toBe(false);
  });

  it('nextCursor 编解码往返：末项 id 单键可解回', async () => {
    const page = await repo().list({ limit: 1 });
    expect(page.hasMore).toBe(true);
    const key = decodeCursor(page.nextCursor as string);
    // 首页 limit=1 → 唯一项 = id 最大者 = expectedOrder[0]；nextCursor 携其 id。
    expect(key.id).toBe(expectedOrder[0]);
    expect('createdAt' in key).toBe(false);
  });

  it('畸形 cursor（合法 base64url·载荷非 [id]）→ BadRequestException 且不查库返数据', async () => {
    const bogus = Buffer.from(JSON.stringify({ nope: true })).toString('base64url');
    await expect(repo().list({ limit: 2, cursor: bogus })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

/*
 * 本地跑法（沿用租户隔离 e2e 的专用库先例·库须已建含 post/organization 表的 schema）：
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_practice \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_practice \
 *     pnpm exec vitest run apps/api/src/modules/posts/infrastructure/repositories/posts-cursor-pagination.e2e.test.ts
 *   （目标库须已应用迁移；夹具自清，运行幂等。）
 */

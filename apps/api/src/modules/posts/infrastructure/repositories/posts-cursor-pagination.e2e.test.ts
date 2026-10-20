import 'reflect-metadata';
import { TransactionScope } from '@app/database/eventing/transaction-scope';
import { Organization } from '@app/database/mikro/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Post } from '@app/modules/posts/infrastructure/entities/post.entity';
import { decodeCursor } from '@core/saas-kit/shared-kernel/domain/pagination';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MikroPostRepository } from './mikro-post.repository';

/**
 * 就绪预备 §2.3 #5 · 切片 B（戊=②）—— GET /posts 游标分页 **真库往返**（env-gated）。
 *
 * 立标准之外，本测兑现「部署/契约声明须以实跑链为验收口径」的纪律：在真实 Postgres 上证明
 * keyset 语义端到端成立——多页翻取**无重无漏**、顺序恰为 `(createdAt DESC, id DESC)` 全序、
 * `hasMore`/`nextCursor` 边界正确、末项 `createdAt` 相同的行靠 `id` 兜底定序（丁裁复合键的关健不变量）、
 * 畸形 cursor → 400 且**先于查库**。单测只能证谓词对象形状，此测证其与真 DB 比较语义对拍一致。
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

  // 6 行：A 最新，B 次新，C/D **同 createdAt**（靠 id 兜底：'d' > 'c' → D 先于 C），E、F 递增旧。
  // 期望全序 (createdAt DESC, id DESC) = [A, B, D, C, E, F]。
  const day = (n: number) => new Date(`2026-0${n}-01T00:00:00.000Z`);
  const seed = [
    { id: `${stamp}-a`, createdAt: day(6) },
    { id: `${stamp}-b`, createdAt: day(5) },
    { id: `${stamp}-c`, createdAt: day(4) },
    { id: `${stamp}-d`, createdAt: day(4) },
    { id: `${stamp}-e`, createdAt: day(3) },
    { id: `${stamp}-f`, createdAt: day(2) },
  ];

  beforeAll(async () => {
    mikro = new MikroOrmService(
      { getDatabaseConfig: () => ({ url: E2E_DB }) } as never,
      // ES Phase B 后半：真 TransactionScope（事务外 fork 行为不变）
      new TransactionScope(),
    );
    const em = await mikro.fork();
    await em.insert(Organization, { id: orgId, name: `E2E Cursor ${stamp}`, slug: orgId } as never);
    for (const p of seed) {
      await em.insert(Post, {
        id: p.id,
        title: `cursor-${p.id}`,
        content: null,
        published: true,
        organizationId: orgId,
        workspaceId: null,
        createdAt: p.createdAt,
        updatedAt: p.createdAt,
      } as never);
    }
  }, 120000);

  afterAll(async () => {
    if (!mikro) return;
    const em = await mikro.fork();
    // organization 级联（ON DELETE CASCADE）清 post；显式先删 post 更稳。
    await em.nativeDelete(Post, { organizationId: orgId } as never);
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

  it('逐页翻取：无重无漏·全序 (createdAt,id) 降序·末项 id 兜底同刻', async () => {
    const r = repo();
    const collected: string[] = [];
    let cursor: string | undefined;
    let guard = 0;

    // 以 limit=2 遍历全部 6 行 → 恰 3 页。
    for (;;) {
      if (guard++ > 10) throw new Error('游标遍历未收敛（疑似死循环）');
      const page = await r.list({ limit: 2, ...(cursor ? { cursor } : {}) });
      collected.push(...page.items.map((i) => i.id));
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
    expect([...collected].sort()).toEqual(seed.map((s) => s.id).sort());
    // 精确全序：同刻 C/D 由 id DESC 定 D 先于 C
    expect(collected).toEqual([
      `${stamp}-a`,
      `${stamp}-b`,
      `${stamp}-d`,
      `${stamp}-c`,
      `${stamp}-e`,
      `${stamp}-f`,
    ]);
  });

  it('首页 limit 大于总量 → 一次取尽·hasMore=false·无 nextCursor', async () => {
    const page = await repo().list({ limit: 20 });
    expect(page.items).toHaveLength(6);
    expect(page.hasMore).toBe(false);
    expect('nextCursor' in page).toBe(false);
  });

  it('nextCursor 编解码往返：末项复合键可解回 (createdAt ISO, id)', async () => {
    const page = await repo().list({ limit: 1 });
    expect(page.hasMore).toBe(true);
    const key = decodeCursor(page.nextCursor as string);
    expect(key.id).toBe(`${stamp}-a`);
    expect(key.createdAt).toBe(day(6).toISOString());
  });

  it('畸形 cursor（合法 base64url·载荷非 [date,id]）→ BadRequestException 且不查库返数据', async () => {
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

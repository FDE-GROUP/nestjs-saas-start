import 'reflect-metadata';
import { AppModule } from '@app/app.module';
import { createValidationPipe } from '@app/common/validation-pipe';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Session, User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { SessionReclaimService } from '@app/modules/auth/infrastructure/session-reclaim.service';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * 过期 session 回收 · env-gated 真库 e2e（module-session-index-and-expiry-reclaim F2）。
 *
 * 坐实「回收谓词正确 + 幂等」——这是单测（mock em）证不了的**真 DB 语义**：
 *   播种 N 条过期 session（`expiresAt < now`）+ M 条未过期（`expiresAt > now`）→
 *   `reclaimOnce()` 只删过期（剩 M）→ 二次调用删 0（幂等·`nativeDelete` 天然可重入）。
 * 顺带坐实 F1 迁移已落库：`session_token_idx` unique 约束在位（重复 token 插入即撞）。
 *
 * 走 `MikroOrmService.fork()` + `em.insert`/`em.count`/`em.nativeDelete`（沿 organization-hard-delete.e2e 范式）。
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行，不破默认 CI 的 DB-free 不变量。夹具用时间戳后缀
 * 唯一键，afterAll 显式清净，运行幂等。回收服务缺省 enabled=false 不启后台 timer，无需 override。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('过期 session 回收 e2e（真库删除谓词 + 幂等 + F1 unique 索引 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let reclaim: SessionReclaimService;

  const stamp = Date.now();
  const userId = `e2e-sr-user-${stamp}`;
  // 唯一 token 窗（避开与其它 gated 文件的 session 交叉·afterAll 仅清本窗）
  const expiredIds = [`e2e-sr-exp-a-${stamp}`, `e2e-sr-exp-b-${stamp}`];
  const activeId = `e2e-sr-active-${stamp}`;

  const past = () => new Date(Date.now() - 86_400_000); // 1 天前
  const future = () => new Date(Date.now() + 86_400_000); // 1 天后

  async function seedSession(id: string, token: string, expiresAt: Date) {
    const em = await mikro.fork();
    // session.updatedAt 列 NOT NULL 无 DB 默认（沿建表 DDL）·必须显式写
    await em.insert(Session, {
      id,
      token,
      userId,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
    reclaim = app.get(SessionReclaimService);

    const em = await mikro.fork();
    await em.insert(User, {
      id: userId,
      name: 'SR E2E',
      email: `sr-${stamp}@e2e.test`,
      updatedAt: new Date(),
    } as never);

    await seedSession(expiredIds[0], `tok-exp-${stamp}-1`, past());
    await seedSession(expiredIds[1], `tok-exp-${stamp}-2`, past());
    await seedSession(activeId, `tok-active-${stamp}`, future());
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    await em.nativeDelete(Session, { id: { $in: [...expiredIds, activeId] } } as never);
    await em.nativeDelete(User, { id: userId } as never);
    await app?.close();
  });

  it('reclaimOnce 只删过期 session，未过期幸存', async () => {
    const em = await mikro.fork();
    expect(await em.count(Session, { id: { $in: expiredIds } } as never)).toBe(2);
    expect(await em.count(Session, { id: activeId } as never)).toBe(1);

    const deleted = await reclaim.reclaimOnce();
    expect(deleted).toBeGreaterThanOrEqual(2);

    const em2 = await mikro.fork();
    expect(await em2.count(Session, { id: { $in: expiredIds } } as never)).toBe(0);
    expect(await em2.count(Session, { id: activeId } as never)).toBe(1); // 未过期不被动
  });

  it('二次 reclaimOnce 幂等删 0（本窗已无过期行）', async () => {
    const em = await mikro.fork();
    // 本窗已全清·二次调用不应再删本窗行（count 保持 0）
    expect(await em.count(Session, { id: { $in: expiredIds } } as never)).toBe(0);
    await reclaim.reclaimOnce();
    const em2 = await mikro.fork();
    expect(await em2.count(Session, { id: { $in: expiredIds } } as never)).toBe(0);
  });

  it('F1 迁移在位：重复 token 撞 session_token_idx unique 约束', async () => {
    const em = await mikro.fork();
    const dupToken = `tok-dup-${stamp}`;
    await seedSession(`e2e-sr-dup1-${stamp}`, dupToken, future());
    // 第二条同 token → 应触发 unique 违例
    await expect(
      em.insert(Session, {
        id: `e2e-sr-dup2-${stamp}`,
        token: dupToken,
        userId,
        expiresAt: future(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never),
    ).rejects.toThrow();
    // 清理 dup1（dup2 未落）
    await em.nativeDelete(Session, { id: `e2e-sr-dup1-${stamp}` } as never);
  });
});

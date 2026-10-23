import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createValidationPipe } from '@app/common/validation-pipe';
import { Event } from '@app/database/eventing/entities/event.entity';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Account,
  Consent,
  Session,
  User,
} from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { DeleteUserCommand } from './application/commands/delete-user.command';

/**
 * PIPL right-to-erase · env-gated 真库 e2e（hardDelete 隐患回归锁）。
 *
 * 背景（事实取证 2026-10-23）：`MikroUserStoreAdapter.hardDelete` 曾用 `nativeDelete(User, { userId })`，
 * 但 `user` 表主键系 `id`（无 `userId` 列——`userId` 仅 account/session/consent 的外键列名）。运行时
 * Mikro 直接抛 `Trying to query by not existing property User.userId` → `DELETE /users/me` 必 500、
 * 自然人永不消亡（被遗忘权实际失效）。此缺陷长期潜伏的唯一原因：`delete-user.command-handler.test.ts`
 * 把端口整体 stub、从无跑过真库的 gated e2e——**本测即补该盲区**（旧码下第①段断言必红）。
 *
 * 走 CommandBus 服务端通道（同 tenant-hard-delete 范式），坐实单测证不了的 **DB 级联语义**：
 *   user 行灭 → account/session 经 FK `ON DELETE CASCADE` 随灭、consent 经 FK `SET NULL` 幸存为匿名台账、
 *   该自然人 `user` 聚合事件行经应用层 `deleteByAggregate` 补删至 0。
 * 另坐实前置闸：删不存在的用户 → NotFound（findById 读不到即不删）。
 *
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行（开关·不破默认 CI 的 DB-free 不变量）。
 * 夹具用时间戳后缀唯一键，afterAll 显式清净，运行幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('用户 PIPL 硬删 e2e（真库 hardDelete + FK cascade/set-null + 事件补删 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let commandBus: CommandBus;

  const stamp = Date.now();
  const userId = `e2e-uhd-user-${stamp}`;
  const accountId = `e2e-uhd-acct-${stamp}`;
  const sessionId = `e2e-uhd-sess-${stamp}`;
  const consentId = `e2e-uhd-consent-${stamp}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // B1 隔离（module-ci-gated-e2e-isolation）：节掉本进程 outbox 后台轮询，避免与共享库其它
      // gated 文件竞抢 event 行；本测断言不依赖后台投递。override 于 init 前生效 = 零启动窗口。
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    // 必须建真实 Fastify 应用（同 tenant-hard-delete/auth-http-surface 先例）：AppModule 的
    // AuthBootstrapService 在 onApplicationBootstrap 挂 BA 原生路由，裸 TestingModule.init() 下
    // httpAdapter 为 undefined 会崩；CqrsModule 亦在 init 生命周期才把 @CommandHandler 注册进 CommandBus。
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
    commandBus = app.get(CommandBus);
  }, 120000);

  async function seedUserOwned() {
    const em = await mikro.fork();
    await em.insert(User, {
      id: userId,
      name: 'UHD E2E',
      email: `uhd-${stamp}@e2e.test`,
      // user.updatedAt 列 NOT NULL 无 DB 默认·必须显式写（同 tenant-hard-delete/seed.ts R-η 教训）
      updatedAt: new Date(),
    } as never);
    await em.insert(Account, {
      id: accountId,
      accountId: `acct-${stamp}`,
      providerId: 'credential',
      userId,
      createdAt: new Date(),
      // account/session/consent 的 updatedAt 系 DB 层 NOT NULL 无默认（迁移真列比运行时实体更严）·必须显式盖
      updatedAt: new Date(),
    } as never);
    await em.insert(Session, {
      id: sessionId,
      expiresAt: new Date(Date.now() + 86_400_000),
      token: `tok-${stamp}`,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    await em.insert(Consent, {
      id: consentId,
      userId,
      purpose: 'analytics',
      version: '1',
      grantedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    // 手写一行 user 聚合事件（不依赖 EVENT_PUBLISH_MODE·FK-less 表应用层补删面）
    await em.insert(Event, {
      eventId: randomUUID(),
      aggregateId: userId,
      aggregateType: 'user',
      version: 1,
      eventType: 'user.status.transitioned',
      payload: { from: null, to: 'active' },
      occurredAt: new Date(),
    } as never);
  }

  async function cleanup() {
    const em = await mikro.fork();
    // 级联可能已灭，显式清净保证运行幂等
    await em.nativeDelete(Event, { aggregateId: userId } as never);
    await em.nativeDelete(Account, { id: accountId } as never);
    await em.nativeDelete(Session, { id: sessionId } as never);
    await em.nativeDelete(Consent, { id: consentId } as never);
    await em.nativeDelete(User, { id: userId } as never);
  }

  afterAll(async () => {
    if (!app) return;
    await cleanup();
    await app?.close();
  });

  it('hardDelete：user 灭、account/session 级联灭、consent set-null 幸存、user 事件补删至 0', async () => {
    await seedUserOwned();
    // 前置：四表各 1 行（播种成功）
    const before = await mikro.fork();
    expect(await before.count(User, { id: userId } as never)).toBe(1);
    expect(await before.count(Account, { userId } as never)).toBe(1);
    expect(await before.count(Session, { userId } as never)).toBe(1);

    // 真硬删（经 CommandBus → DeleteUserCommandHandler → 真 AUTH_USER_STORE.hardDelete + eventStore 补删）
    await expect(commandBus.execute(new DeleteUserCommand(userId))).resolves.toBeUndefined();

    const em = await mikro.fork();
    // ① user 行灭（PIPL 被遗忘权·旧码此处必 500 且行幸存）
    expect(await em.count(User, { id: userId } as never)).toBe(0);
    // ② account/session 经 FK ON DELETE CASCADE 随灭（真库 DB 级联语义·单测 mock 证不了）
    expect(await em.count(Account, { userId } as never)).toBe(0);
    expect(await em.count(Session, { userId } as never)).toBe(0);
    // ③ consent 经 FK SET NULL 幸存为匿名台账（userId 归 null·PIPL 同意证据不连带销毁）
    const consent = await em.findOne(Consent, { id: consentId } as never);
    expect(consent).not.toBeNull();
    expect(consent?.userId).toBeNull();
    // ④ user 聚合事件补删至 0（PIPL 不留残迹）
    expect(await em.count(Event, { aggregateId: userId } as never)).toBe(0);

    // ⑤ 重复硬删 → NotFound（findById 读不到即不删·幂等前置闸）
    await expect(commandBus.execute(new DeleteUserCommand(userId))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/*
 * 本地跑法（专用 nestjs_e2e 库·不污染 dev 数据·schema 须已含上述各表）：
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/modules/users/user-hard-delete.e2e.test.ts
 * 链上跑法：`pnpm run test:fullstack`（Testcontainers 一次性 PG·重放已提交迁移建 schema·用完即焚）。
 */

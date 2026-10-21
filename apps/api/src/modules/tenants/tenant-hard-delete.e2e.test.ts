import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createValidationPipe } from '@app/common/validation-pipe';
import { Event } from '@app/database/eventing/entities/event.entity';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import {
  Invitation,
  Member,
  Organization,
} from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { CommandBus } from '@nestjs/cqrs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module';
import { DeleteTenantCommand } from '../tenants/application/commands/delete-tenant.command';
import { DeleteTenantPermanentlyCommand } from '../tenants/application/commands/delete-tenant-permanently.command';
import {
  TENANT_GOVERNANCE_REPOSITORY,
  type TenantGovernanceRepository,
} from '../tenants/domain/repositories/tenant-governance.repository';

/**
 * NFR-6 删除半 · env-gated 真库 e2e（module-tenancy-hard-delete §4-3）：
 * 真 DB 上坐实「软删 → 硬删」两段式编排的 **FK cascade 实效**——本测是本切片
 * 唯一触真库的 cascade/补删证据（单测面全部 mock，证不了 DB 级联语义）。
 *
 * 编排走 CommandBus 服务端通道（同软删/审批面范式）：
 *   真软删（DeleteTenantCommand → transition deleted）→ 真硬删（DeleteTenantPermanentlyCommand）
 *   → 断言六表 0 行 + `tenant` 聚合事件 0 行（先补删后主删）+ **user 行幸存**（自然人不连带）。
 * 另坐实前置闸：active 租户硬删 → 409 且不删。
 *
 * #2 甲档（module-p0-async-boundary-correctness 切片 D）：补一条**原子反证**——注入 ②删主行失败，
 *   坐实①事件删除随之回滚（事件仍在、主行仍在）——无「主行已没、事件残留」的部分提交窗口（PIPL）。
 *
 * ORM 修宪案 B · Phase 2（彻底去旧 ORM）：夹具播种 / 级联读回 / 残净由旧 `原数据库服务.db` 换轨为
 * `MikroOrmService.fork()`——`em.insert`（只发给定列·DB 默认照旧）/`em.count`/`em.nativeDelete`，
 * **只换通道·不改行为**（列集逐字镜像旧实现 values）。
 *
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行（开关），连接串取 `DATABASE_URL`，
 * 不破默认 CI 的 DB-free 不变量。夹具用时间戳后缀唯一键，afterAll 显式清净，运行幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('按租户硬删全栈 e2e（真库 FK cascade + 事件补删 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let commandBus: CommandBus;

  const stamp = Date.now();
  const userId = `e2e-hd-user-${stamp}`;
  const orgId = `e2e-hd-org-${stamp}`;
  const activeOrgId = `e2e-hd-active-${stamp}`;
  const atomicOrgId = `e2e-hd-atomic-${stamp}`;

  async function seedTenantOwned(em: EntityManager, id: string, withExtras: boolean) {
    await em.insert(Organization, { id, name: `HD ${id}`, slug: `hd-${id}` } as never);
    if (!withExtras) return;
    await em.insert(Member, {
      id: `e2e-hd-mem-${stamp}`,
      organizationId: id,
      userId,
      role: 'owner',
    } as never);
    await em.insert(Invitation, {
      id: `e2e-hd-inv-${stamp}`,
      organizationId: id,
      email: `invitee-${stamp}@e2e.test`,
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: userId,
    } as never);
    await em.insert(Workspace, {
      id: `e2e-hd-ws-${stamp}`,
      organizationId: id,
      name: 'Core',
      slug: `core-${stamp}`,
      // updatedAt 列 NOT NULL 无 DB 默认（同 seed.ts R-η 教训）·写路径显式盖
      updatedAt: new Date(),
    } as never);
    await em.insert(TenantSubscription, {
      id: `e2e-hd-sub-${stamp}`,
      tenantId: id,
      plan: 'free',
      seatsLimit: 5,
      updatedAt: new Date(),
    } as never);
    await em.insert(PostEntity, {
      id: `e2e-hd-post-${stamp}`,
      title: 'HD e2e',
      organizationId: id,
      updatedAt: new Date(),
    } as never);
    // 手写一行 tenant 聚合事件（不依赖 EVENT_PUBLISH_MODE 开关·FK-less 表应用层补删面）
    await em.insert(Event, {
      eventId: randomUUID(),
      aggregateId: id,
      aggregateType: 'tenant',
      version: 1,
      eventType: 'tenant.status.transitioned',
      payload: { from: null, to: 'active' },
      occurredAt: new Date(),
    } as never);
  }

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
    // 必须建真实 Fastify 应用（同 auth-http-surface.e2e 先例）：AppModule 的 AuthBootstrapService
    // 在 onApplicationBootstrap 挂 BA 原生路由，裸 TestingModule.init() 下 `httpAdapter.getInstance()`
    // 为 undefined 会崩；`createNestApplication(FastifyAdapter)` + `init()` 才实例化适配器（无需 listen）。
    // CqrsModule 在生命周期（init）才把 @CommandHandler 注册进 CommandBus，经 CommandBus 驱动的本测必须 init。
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // 与生产入口同装配（global-ci-fullstack-pg 切片 A′：校验管单源见 common/validation-pipe.ts）。
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
    commandBus = app.get(CommandBus);

    const em = await mikro.fork();
    await em.insert(User, {
      id: userId,
      name: 'HD E2E',
      email: `hd-${stamp}@e2e.test`,
      // user.updatedAt 列 NOT NULL 无 DB 默认·必须显式写（同 seed.ts）
      updatedAt: new Date(),
    } as never);
    await seedTenantOwned(em, orgId, true);
    await seedTenantOwned(em, activeOrgId, false);
    // atomicOrgId：仅主行 + 一行 tenant 聚合事件（子表 id 取 stamp 固定值，与 orgId 全量 seed 会 pkey 互撞），
    //  #2 甲档原子反证只需「deleted 态 org + ≥一行事件」。
    await seedTenantOwned(em, atomicOrgId, false);
    await em.insert(Event, {
      eventId: randomUUID(),
      aggregateId: atomicOrgId,
      aggregateType: 'tenant',
      version: 1,
      eventType: 'tenant.status.transitioned',
      payload: { from: null, to: 'active' },
      occurredAt: new Date(),
    } as never);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    // 清净残余（org 级联灭子表；user/event 独立清）——运行幂等
    const em = await mikro.fork();
    await em.nativeDelete(Organization, { id: { $in: [orgId, activeOrgId] } } as never);
    await em.nativeDelete(Event, { aggregateId: { $in: [orgId, activeOrgId] } } as never);
    // atomicOrgId 回滚后仍在（事务未提交）——显式清净保证运行幂等
    await em.nativeDelete(Event, { aggregateId: atomicOrgId } as never);
    await em.nativeDelete(Organization, { id: atomicOrgId } as never);
    await em.nativeDelete(User, { id: userId } as never);
    await app?.close();
  });

  it('软删→硬删：六表 cascade 灭、tenant 事件补删、user 幸存；重复硬删 404 幂等', async () => {
    // ① 真软删（transition → deleted 终态）
    const soft = await commandBus.execute(new DeleteTenantCommand(orgId, userId));
    expect(soft).toMatchObject({ organizationId: orgId, status: TENANT_STATUS.DELETED });

    // ② 真硬删（先补删事件后删主行）
    const result = await commandBus.execute(new DeleteTenantPermanentlyCommand(orgId, userId));
    expect(result).toMatchObject({ organizationId: orgId });
    const purged = (result as { purgedEvents: number }).purgedEvents;
    expect(purged).toBeGreaterThanOrEqual(1); // 至少清掉本测手写的那行

    // ③ 六表 cascade 断言（真库 DB 级联语义·单测 mock 证不了的面）
    const em = await mikro.fork();
    const counts = [
      await em.count(Organization, { id: orgId } as never),
      await em.count(Member, { organizationId: orgId } as never),
      await em.count(Invitation, { organizationId: orgId } as never),
      await em.count(Workspace, { organizationId: orgId } as never),
      await em.count(TenantSubscription, { tenantId: orgId } as never),
      await em.count(PostEntity, { organizationId: orgId } as never),
    ];
    for (const count of counts) expect(count).toBe(0);

    // ④ tenant 聚合事件补删至 0；user 行幸存（自然人不连带）
    const eventsLeft = await em.count(Event, { aggregateId: orgId } as never);
    expect(eventsLeft).toBe(0);
    const userLeft = await em.count(User, { id: userId } as never);
    expect(userLeft).toBe(1);

    // ⑤ 重复硬删 → null（controller 面 404 幂等语义）
    await expect(
      commandBus.execute(new DeleteTenantPermanentlyCommand(orgId, userId)),
    ).resolves.toBeNull();
  });

  it('前置闸：active 租户硬删 → 409 且行保留（两段式不可越过）', async () => {
    await expect(
      commandBus.execute(new DeleteTenantPermanentlyCommand(activeOrgId, userId)),
    ).rejects.toThrow(/not in deleted terminal state/);
    const em = await mikro.fork();
    const rows = await em.count(Organization, { id: activeOrgId } as never);
    expect(rows).toBe(1);
  });

  it('#2 甲档 原子反证：②删主行失败注入 → ①事件删除一并回滚（无部分提交·org 仍在可整请求重试）', async () => {
    // 先软删进 deleted 终态越过前置闸（否则 409 根本进不到 uow.run）
    await commandBus.execute(new DeleteTenantCommand(atomicOrgId, userId));
    const governance = app.get<TenantGovernanceRepository>(TENANT_GOVERNANCE_REPOSITORY);
    const spy = vi
      .spyOn(governance, 'destroy')
      .mockRejectedValue(new Error('injected destroy failure'));
    try {
      await expect(
        commandBus.execute(new DeleteTenantPermanentlyCommand(atomicOrgId, userId)),
      ).rejects.toThrow('injected destroy failure');
    } finally {
      spy.mockRestore();
    }
    const em = await mikro.fork();
    // ① 事件补删被同事务回滚：tenant 聚合事件仍在（若非原子则事件已没——即残窗）
    const eventsLeft = await em.count(Event, { aggregateId: atomicOrgId } as never);
    expect(eventsLeft).toBeGreaterThanOrEqual(1);
    // ② 主行仍在（回滚后 org 未没·可整请求重试，不留「主行已没、事件残留」孤儿）
    expect(await em.count(Organization, { id: atomicOrgId } as never)).toBe(1);
  });
});

/*
 * 本地跑法（专用 nestjs_e2e 库·不污染 dev 数据·库须已建含上述各表的 schema）：
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/tenancy/tenant-hard-delete.e2e.test.ts
 *   docker exec postgres-dev psql -U postgres -c "DROP DATABASE nestjs_e2e;"              # 用完清理（可选）
 */

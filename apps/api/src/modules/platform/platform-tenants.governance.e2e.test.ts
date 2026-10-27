import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createValidationPipe } from '@app/common/validation-pipe';
import { Event } from '@app/database/eventing/entities/event.entity';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  Invitation,
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { EntityManager } from '@mikro-orm/core';
import { CommandBus } from '@nestjs/cqrs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { DeleteOrganizationCommand } from '../organizations/application/commands/delete-organization.command';
import { DeleteOrganizationPermanentlyCommand } from '../organizations/application/commands/delete-organization-permanently.command';
import { SuspendOrganizationCommand } from '../organizations/application/commands/suspend-organization.command';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '../organizations/domain/repositories/organization-governance.repository';

/**
 * 平台治理台改锚 tenant · env-gated 真库 e2e（rehierarchy 片一 §H4）。
 *
 * 本测坐实 `organization-hard-delete.e2e` **未覆盖的一租多组织（companion org）真相**——
 * `organization.id ≠ tenant.id` 且 `organization.tenantId` 指向父租户：
 *   ① 读侧：`listTenants` 组织计数经 `tenantId ?? id` 折叠命中 companion；`findTenantDetail` 名册含全部 org；
 *      `tenant.status` 为准入权威——suspend 后 companion org 经 `findOrganizationAdmission` 读到 `suspended`
 *      （而非其自有恒 `active` 的 `org.status`，即改锚前的读侧回落 bug 反证）。
 *   ② 写侧：软删/硬删均对**租户**动作（`transition(tenantId)` + 连带 `destroyTenant`）；硬删连带清除该租户名下
 *      **所有 org 及其子表**（DB FK cascade）+ 订阅行 + 租户本体 + 事件双维补删（tenantId + 每 orgId）。
 *   ③ 跨租操作员全量可见（exempt 面不回归）：一次 `listTenants` 同页见多租（一租多组织 + 1:1 骨架并存）。
 *
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行；夹具时间戳后缀唯一键，afterAll 显式清净，运行幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('平台租户治理台 e2e（一租多组织 cascade + 跨租可见 + suspend 准入权威 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let commandBus: CommandBus;
  let governance: OrganizationGovernanceRepository;

  const stamp = Date.now();
  const userId = `e2e-mt-user-${stamp}`;
  // 一租多组织的父租户（companion orgs 的 tenantId）——slug/name 携 stamp 便于 search 精确命中。
  const multiTenantId = `e2e-mt-tenant-${stamp}`;
  const companionA = `e2e-mt-orgA-${stamp}`;
  const companionB = `e2e-mt-orgB-${stamp}`;
  // 1:1 骨架租户（org.id == tenant.id·expand 段未盖 tenantId）——证 `tenantId ?? id` 折叠 + 跨租同页可见。
  const soloTenantId = `e2e-mt-solo-${stamp}`;

  async function seedTenant(em: EntityManager, id: string, name: string) {
    await em.insert(Tenant, {
      id,
      name,
      slug: name.toLowerCase(),
      status: TENANT_STATUS.ACTIVE,
      createdAt: new Date(),
      updatedAt: null,
    } as never);
  }

  // 组织 + 其子表（member/invitation/workspace/post）+ 一行 tenant 聚合事件（aggregateId=组织维度）。
  async function seedOrganizationOwned(em: EntityManager, orgId: string, tenantId: string | null) {
    // 切片 6（D3）：`organization.status` 列已 DROP——名下组织不再自持准入态，治理真相单一锥归 `tenant.status`。
    await em.insert(Organization, {
      id: orgId,
      name: `MT ${orgId}`,
      slug: `mt-${orgId}`,
      ...(tenantId ? { tenantId } : {}),
    } as never);
    await em.insert(Member, {
      id: `e2e-mt-mem-${orgId}`,
      organizationId: orgId,
      userId,
      role: 'owner',
    } as never);
    await em.insert(Invitation, {
      id: `e2e-mt-inv-${orgId}`,
      organizationId: orgId,
      email: `invitee-${orgId}@e2e.test`,
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: userId,
    } as never);
    await em.insert(Workspace, {
      id: `e2e-mt-ws-${orgId}`,
      organizationId: orgId,
      name: 'Core',
      slug: `core-${orgId}`,
      updatedAt: new Date(),
    } as never);
    await em.insert(PostEntity, {
      id: `e2e-mt-post-${orgId}`,
      title: 'MT e2e',
      organizationId: orgId,
      updatedAt: new Date(),
    } as never);
    // 组织维度事件（假设④：`tenant` 聚合下组织领域事件记 orgId·硬删须双维补删）。
    await em.insert(Event, {
      eventId: randomUUID(),
      aggregateId: orgId,
      aggregateType: 'tenant',
      version: 1,
      eventType: 'organization.created',
      payload: { orgId },
      occurredAt: new Date(),
    } as never);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // B1 隔离（同 organization-hard-delete.e2e）：节掉本进程 outbox 后台轮询根，免与共享库他 gated 竞抢。
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
    commandBus = app.get(CommandBus);
    governance = app.get(ORGANIZATION_GOVERNANCE_REPOSITORY);

    const em = await mikro.fork();
    await em.insert(User, {
      id: userId,
      name: 'MT E2E',
      email: `mt-${stamp}@e2e.test`,
      updatedAt: new Date(),
    } as never);

    // ① 一租多组织：租户行 + 两个 companion org（tenantId 指向本租户·org.id ≠ tenant.id）+ 租户本体事件 + 订阅行。
    await seedTenant(em, multiTenantId, `MT-multi-${stamp}`);
    await seedOrganizationOwned(em, companionA, multiTenantId);
    await seedOrganizationOwned(em, companionB, multiTenantId);
    await em.insert(Event, {
      eventId: randomUUID(),
      aggregateId: multiTenantId,
      aggregateType: 'tenant',
      version: 1,
      eventType: 'tenant.status.transitioned',
      payload: { from: null, to: 'active' },
      occurredAt: new Date(),
    } as never);
    await em.insert(TenantSubscription, {
      id: `e2e-mt-sub-${stamp}`,
      tenantId: multiTenantId,
      plan: 'pro',
      seatsLimit: 10,
      updatedAt: new Date(),
    } as never);

    // ② 1:1 骨架租户（org.id == tenant.id·无 tenantId 盖章）——跨租同页可见 + 折叠计数对拍。
    await seedTenant(em, soloTenantId, `MT-solo-${stamp}`);
    await seedOrganizationOwned(em, soloTenantId, null);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    const ids = [multiTenantId, companionA, companionB, soloTenantId];
    await em.nativeDelete(Event, { aggregateId: { $in: ids } } as never);
    await em.nativeDelete(TenantSubscription, { tenantId: { $in: ids } } as never);
    await em.nativeDelete(Organization, { id: { $in: ids } } as never);
    await em.nativeDelete(Tenant, { id: { $in: ids } } as never);
    await em.nativeDelete(User, { id: userId } as never);
    await app?.close();
  });

  it('跨租全量可见 + 一租多组织折叠计数（listTenants·exempt 面不回归）', async () => {
    // search 命 tenant.name/slug 之 `%term%`：两租名 `MT-multi-${stamp}`/`MT-solo-${stamp}` 共有 token 唯 stamp（13 位运行戳·本 run 特异）。
    const page = await governance.listTenants({ limit: 20, offset: 0, search: `${stamp}` });
    const byId = new Map(page.items.map((t) => [t.tenantId, t]));
    // 同页见两租（一租多组织 + 1:1 骨架）——平台 exempt 天然全量，不因租户上下文漏行。
    expect(byId.has(multiTenantId)).toBe(true);
    expect(byId.has(soloTenantId)).toBe(true);
    // companion 经 `tenantId ?? id` 折叠计数=2；1:1 骨架无 tenantId 回落 org.id 计数=1。
    expect(byId.get(multiTenantId)?.organizationCount).toBe(2);
    expect(byId.get(soloTenantId)?.organizationCount).toBe(1);
    expect(byId.get(multiTenantId)?.status).toBe(TENANT_STATUS.ACTIVE);
  });

  it('findTenantDetail 名册含全部 companion org', async () => {
    const detail = await governance.findTenantDetail(multiTenantId);
    expect(detail).not.toBeNull();
    const orgIds = new Set(detail?.organizations.map((o) => o.organizationId));
    expect(orgIds.has(companionA)).toBe(true);
    expect(orgIds.has(companionB)).toBe(true);
  });

  it('suspend 租户 → companion org 读准入态=suspended（非其自有恒 active·改锚读侧反证）', async () => {
    const soft = await commandBus.execute(new SuspendOrganizationCommand(multiTenantId, userId));
    expect(soft).toMatchObject({ tenantId: multiTenantId, status: TENANT_STATUS.SUSPENDED });
    // 切片 6（D3）后组织自有态列已 DROP，无「org 自有恒 active」可读；改锚正证只看经租户解析的准入态：
    // companion org（tenantId=multiTenantId）→ findOrganizationAdmission 正确回落 suspended
    //（改锚前经 id==orgId 叠加会恒 active 的 bug 不复现）。
    const admission = await governance.findOrganizationAdmission(companionA);
    expect(admission).toBe(TENANT_STATUS.SUSPENDED);
    // 租户停留 suspended（非 deleted）——供下一条前置闸反证 + 末条软删（suspended→deleted 合法）。
  });

  it('前置闸：非 deleted 终态硬删 → 409（两段式不可越过）', async () => {
    await expect(
      commandBus.execute(new DeleteOrganizationPermanentlyCommand(multiTenantId, userId)),
    ).rejects.toThrow(/not in deleted terminal state/);
    const em = await mikro.fork();
    expect(await em.count(Organization, { tenantId: multiTenantId } as never)).toBe(2);
  });

  it('软删→硬删租户：名下所有 org 及子表 cascade 灭 + 订阅/租户本体清 + 事件双维补删 + user 幸存', async () => {
    // 先软删进 deleted 终态越过前置闸（封禁整个租户·非改各 org 自有态）
    const soft = await commandBus.execute(new DeleteOrganizationCommand(multiTenantId, userId));
    expect(soft).toMatchObject({ tenantId: multiTenantId, status: TENANT_STATUS.DELETED });

    // 硬删连带（对租户动作）
    const result = await commandBus.execute(
      new DeleteOrganizationPermanentlyCommand(multiTenantId, userId),
    );
    expect(result).toMatchObject({ tenantId: multiTenantId });
    const purged = result as { purgedOrgs: number; purgedEvents: number };
    expect(purged.purgedOrgs).toBeGreaterThanOrEqual(2); // 两个 companion org 连带
    expect(purged.purgedEvents).toBeGreaterThanOrEqual(3); // tenantId + 每 orgId 双维

    const em = await mikro.fork();
    // 租户本体 + 名下组织全没
    expect(await em.count(Tenant, { id: multiTenantId } as never)).toBe(0);
    expect(await em.count(Organization, { id: { $in: [companionA, companionB] } } as never)).toBe(
      0,
    );
    // 各 org 子表由 DB FK cascade 消灭（逐 org 断言真库级联语义·单测 mock 证不了）
    for (const orgId of [companionA, companionB]) {
      expect(await em.count(Member, { organizationId: orgId } as never)).toBe(0);
      expect(await em.count(Invitation, { organizationId: orgId } as never)).toBe(0);
      expect(await em.count(Workspace, { organizationId: orgId } as never)).toBe(0);
      expect(await em.count(PostEntity, { organizationId: orgId } as never)).toBe(0);
    }
    // 订阅行清 + 事件双维补删至 0（tenantId + 每 orgId）
    expect(await em.count(TenantSubscription, { tenantId: multiTenantId } as never)).toBe(0);
    expect(
      await em.count(Event, {
        aggregateId: { $in: [multiTenantId, companionA, companionB] },
      } as never),
    ).toBe(0);
    // 自然人不连带
    expect(await em.count(User, { id: userId } as never)).toBe(1);

    // 重复硬删 → null（404 幂等）
    await expect(
      commandBus.execute(new DeleteOrganizationPermanentlyCommand(multiTenantId, userId)),
    ).resolves.toBeNull();
  });
});

/*
 * 本地跑法（专用 nestjs_e2e 库·不污染 dev 数据）：
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/modules/platform/platform-tenants.governance.e2e.test.ts
 */

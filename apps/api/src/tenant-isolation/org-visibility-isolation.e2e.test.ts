import 'reflect-metadata';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  TenantInvitation,
  TenantMembership,
  TenantRoleAssignment,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import {
  type TenantIsolationScope,
  tenantIsolationStorage,
} from '@core/saas-kit/tenant-isolation/tenant-isolation-scope';
import type { EntityManager } from '@mikro-orm/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

/**
 * 每租户租内跨组织可见性策略 **真库端到端**（第三次层级复裁 切片 3·D2/评审 pt1·env-gated）。
 *
 * 证真切片 1 全局 filter 在 `tenant.orgVisibility` 两态下的租内隔离语义（本片激活 org 收窄）：
 *  - `shared`（缺省）：同租内跨组织**互见**——A-org 上下文读到本租 A/B 两组织的工作区（存量零行为变更）；
 *  - `isolated`：同租内跨组织**互不可见**——A-org 上下文只读 A、读不见 B（防火墙/子公司隔离场景）；
 *  - **安全底线恒等**：任一租内上下文都读不见**跨租**（T2）数据——`tenantId` 永不放松的硬地板。
 *
 * 机制事实：filter 参数由 ALS 作用域派生（`MikroOrmService.fork` → `tenantFilterArgsFromScope`），
 * 故本 e2e 用 `tenantIsolationStorage.run(scope, …)` 直接绑定「已激活组织 + 可见性策略」的作用域，
 * 复刻中间件解析链（切片 3 经 `TENANT_SCOPE_RESOLVER` 顺带读回 `orgVisibility` 注入 ALS）的下游消费面。
 * 另以 `scoped:false` 证平台治理/跨租面显式豁免（不受 filter 收窄）。
 *
 * 附带持久列证真：`tenant` 行读回 `orgVisibility`（切片 3 迁移落库·默认 shared）。
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行·夹具 afterAll 清净·时间戳后缀保幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('租内跨组织可见性策略端到端（D2·shared 互见 / isolated 互不可见 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;

  const stamp = Date.now();
  const tenantId = uuidv7();
  const orgA = uuidv7();
  const orgB = uuidv7();
  const tenant2 = uuidv7();
  const orgC = uuidv7();
  const wsA = uuidv7();
  const wsB = uuidv7();
  const wsC = uuidv7();
  const createdUserIds: string[] = [];

  const scope = (
    extra: Partial<TenantIsolationScope> & { tenantId: string; organizationId: string },
  ): TenantIsolationScope => ({ userId: uuidv7(), ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    mikro = app.get(MikroOrmService);

    const now = new Date();
    const em = await mikro.fork({ scoped: false });
    await em.insert(Tenant, [
      {
        id: tenantId,
        name: `E2E Vis ${stamp}`,
        slug: `e2e-vis-${stamp}`,
        status: 'active',
        orgVisibility: 'shared',
        createdAt: now,
        updatedAt: null,
      },
      {
        id: tenant2,
        name: `E2E Vis T2 ${stamp}`,
        slug: `e2e-vis-t2-${stamp}`,
        status: 'active',
        orgVisibility: 'isolated',
        createdAt: now,
        updatedAt: null,
      },
    ] as never);
    await em.insert(Organization, [
      {
        id: orgA,
        tenantId,
        name: `A ${stamp}`,
        slug: `a-${stamp}`,
        createdAt: now,
        updatedAt: null,
      },
      {
        id: orgB,
        tenantId,
        name: `B ${stamp}`,
        slug: `b-${stamp}`,
        createdAt: now,
        updatedAt: null,
      },
      {
        id: orgC,
        tenantId: tenant2,
        name: `C ${stamp}`,
        slug: `c-${stamp}`,
        createdAt: now,
        updatedAt: null,
      },
    ] as never);
    await em.insert(Workspace, [
      {
        id: wsA,
        tenantId,
        organizationId: orgA,
        name: 'wa',
        slug: `wa-${stamp}`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: wsB,
        tenantId,
        organizationId: orgB,
        name: 'wb',
        slug: `wb-${stamp}`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: wsC,
        tenantId: tenant2,
        organizationId: orgC,
        name: 'wc',
        slug: `wc-${stamp}`,
        createdAt: now,
        updatedAt: now,
      },
    ] as never);
    await em.flush();
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork({ scoped: false });
    await em.nativeDelete(Workspace, { id: { $in: [wsA, wsB, wsC] } } as never);
    await em.nativeDelete(Organization, { id: { $in: [orgA, orgB, orgC] } } as never);
    await em.nativeDelete(Tenant, { id: { $in: [tenantId, tenant2] } } as never);
    if (createdUserIds.length) {
      // 租级三表行已随 Tenant FK cascade 清净，再收钉锁面自建的用户行。
      await em.nativeDelete(User, { id: { $in: createdUserIds } } as never);
    }
    await app.close();
  });

  const readVisible = (ctx: TenantIsolationScope): Promise<string[]> =>
    tenantIsolationStorage.run(ctx, async () => {
      const em = await mikro.fork();
      const rows = (await em.find(Workspace, {} as never, { fields: ['id'] as never })) as {
        id: string;
      }[];
      return rows.map((r) => r.id).sort();
    });

  it('shared：同租内跨组织互见（A-org 见 A+B·不见跨租 C）', async () => {
    const visible = await readVisible(
      scope({ tenantId, organizationId: orgA, orgVisibility: 'shared' }),
    );
    expect(visible).toEqual([wsA, wsB].sort());
  }, 60000);

  it('isolated：同租内跨组织互不可见（A-org 只见 A·读不见 B）', async () => {
    const visibleA = await readVisible(
      scope({ tenantId, organizationId: orgA, orgVisibility: 'isolated' }),
    );
    expect(visibleA).toEqual([wsA]);
    const visibleB = await readVisible(
      scope({ tenantId, organizationId: orgB, orgVisibility: 'isolated' }),
    );
    expect(visibleB).toEqual([wsB]);
  }, 60000);

  it('P0 X3：isolated 租 + 活动仅租（无 org）→ org-partitioned 读面 fail-closed 空集（不跨 org 泄露）', async () => {
    // 复刻中间件「显式激活租·未选 org」态：ALS 绑 tenantId + orgVisibility=isolated 但 organizationId 缺省。
    // 旧 best-effort filter 退化到仅剩租户地板 → 见 wsA+wsB（跨 org 泄露）；X3 对 org-partitioned 实体（Workspace）收拒所有。
    const isolatedNoOrg = await readVisible({
      userId: uuidv7(),
      tenantId,
      orgVisibility: 'isolated',
    } as TenantIsolationScope);
    expect(isolatedNoOrg).toEqual([]);
    // 对照：同「无 org」态但 shared → 仅租户地板·同租跨 org 互见（零行为变更·不受累）。
    const sharedNoOrg = await readVisible({
      userId: uuidv7(),
      tenantId,
      orgVisibility: 'shared',
    } as TenantIsolationScope);
    expect(sharedNoOrg).toEqual([wsA, wsB].sort());
  }, 60000);

  it('安全底线：任一租内上下文恒读不见跨租数据（tenantId 硬地板）', async () => {
    // shared 与 isolated 两态下，T 内上下文都读不见 T2 的 wsC；反之 T2 只见 wsC。
    for (const vis of ['shared', 'isolated'] as const) {
      const visibleInT = await readVisible(
        scope({ tenantId, organizationId: orgA, orgVisibility: vis }),
      );
      expect(visibleInT).not.toContain(wsC);
    }
    const visibleInT2 = await readVisible(
      scope({ tenantId: tenant2, organizationId: orgC, orgVisibility: 'isolated' }),
    );
    expect(visibleInT2).toEqual([wsC]);
  }, 60000);

  it('scoped:false 平台治理面显式豁免：不受 org 收窄·跨租全见', async () => {
    const all = await tenantIsolationStorage.run(
      scope({ tenantId, organizationId: orgA, orgVisibility: 'isolated' }),
      async () => {
        const em = await mikro.fork({ scoped: false });
        // 查询边界限定本文件自有两租户（scoped:false 不加全局 filter·亦不加 org 收窄）：证明即便处于
        // isolated 的 orgA 上下文，scoped:false 仍见两租全部工作区（wsA+wsB+wsC·跨租且不受 org 窄化）。
        // 不按「全库 workspace 恰等于自有三条」断言——多 gated 文件并发共享同一 Testcontainers 库时，
        // 他文件在别租户的存活工作区会污染全局集（时序相关·非产品缺陷）。
        const rows = (await em.find(
          Workspace,
          { tenantId: { $in: [tenantId, tenant2] } } as never,
          { fields: ['id'] as never },
        )) as { id: string }[];
        return rows.map((r) => r.id).sort();
      },
    );
    expect(all).toEqual([wsA, wsB, wsC].sort());
  }, 60000);

  it('持久列证真：tenant.orgVisibility 落库读回（默认 shared·isolated 可存）', async () => {
    const em: EntityManager = await mikro.fork({ scoped: false });
    const t1 = await em.findOne(Tenant, { id: tenantId } as never, {
      fields: ['id', 'orgVisibility'] as never,
    });
    const t2 = await em.findOne(Tenant, { id: tenant2 } as never, {
      fields: ['id', 'orgVisibility'] as never,
    });
    expect(t1?.orgVisibility).toBe('shared');
    expect(t2?.orgVisibility).toBe('isolated');
  }, 60000);

  it('P0 D2：未装参 em 语义钉锁（newTransactionEm 抛·fork scoped:false 装空参跨租全见不抛）', async () => {
    // 钉锁 MikroORM v7 filter 空参语义·防升级漂移两条真相：
    //  ① `newTransactionEm()` = `orm.em.fork()` 不调 `applyTenantFilterParams`→filter 参从未装配，
    //     读**在册过滤实体** Organization 时 v7 在 cond 之前即抛「No arguments provided for filter」
    //     （框架级守卫·非谓词能吞——空参 em 根本走不到 `tenantIsolationCondition`·后者对 undefined
    //     返回 `{}` 仅为已装参路径的纵深防御）→ 故跨租治理读面必走 fork({scoped:false}) 而非 newTransactionEm。
    //  ② `fork({ scoped:false })` 显式装空参 `{}`→`tenantIsolationCondition({})={}` 恒真不筛（不抛）·
    //     Organization 在册但跨租全见三组织。防升级把「装空参」路径改为抛错/默认收窄。
    const rawEm = await mikro.newTransactionEm();
    await expect(
      rawEm.find(Organization, { id: { $in: [orgA, orgB, orgC] } } as never, {
        fields: ['id'] as never,
      }),
    ).rejects.toThrow(/No arguments provided for filter/);

    const em = await mikro.fork({ scoped: false });
    const rows = (await em.find(Organization, { id: { $in: [orgA, orgB, orgC] } } as never, {
      fields: ['id'] as never,
    })) as { id: string }[];
    // orgC 属 tenant2·orgA/orgB 属 tenantId——装空参 scoped:false 跨租全见三组织（不抛）。
    expect(rows.map((r) => r.id).sort()).toEqual([orgA, orgB, orgC].sort());
  }, 60000);

  it('X7 close-mech：租级三表在册钉锁（ALS 租户地板·scoped:false 跨租全见·未装参 em 抛）', async () => {
    // tenant_membership/tenant_role_assignment/tenant_invitation 入 `tenantIsolation` 在册集（纪律→机制）：
    // 绑租 ALS 下 scoped fork 无手写 where 仍只落本租行（机制地板）；名册/计量/消费点等跨租面
    // 显式 scoped:false 绕筛（双保险·沿 X1 教训）；未装参 em 读新在册实体同 P0 D2① 抛形。
    const now = new Date();
    const uidA = uuidv7();
    const uidC = uuidv7();
    const seedEm = await mikro.fork({ scoped: false });
    await seedEm.insert(User, [
      {
        id: uidA,
        name: 'Vis A',
        email: `e2e-vis-a-${stamp}@example.com`,
        emailVerified: false,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uidC,
        name: 'Vis C',
        email: `e2e-vis-c-${stamp}@example.com`,
        emailVerified: false,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
    ] as never);
    createdUserIds.push(uidA, uidC);
    await seedEm.insert(TenantMembership, [
      { id: `tm-${tenantId}`, tenantId, userId: uidA, createdAt: now, updatedAt: null },
      { id: `tm-${tenant2}`, tenantId: tenant2, userId: uidC, createdAt: now, updatedAt: null },
    ] as never);
    await seedEm.insert(TenantRoleAssignment, [
      {
        id: `tra-${tenantId}`,
        tenantId,
        userId: uidA,
        roleKey: 'member',
        createdAt: now,
        updatedAt: null,
      },
      {
        id: `tra-${tenant2}`,
        tenantId: tenant2,
        userId: uidC,
        roleKey: 'owner',
        createdAt: now,
        updatedAt: null,
      },
    ] as never);
    await seedEm.insert(TenantInvitation, [
      {
        id: `ti-${tenantId}`,
        tenantId,
        email: `e2e-vis-inv-${stamp}@example.com`,
        roleKey: 'member',
        invitorId: null,
        status: 'pending',
        token: `tok-vis-${stamp}-a`,
        expiresAt: null,
        createdAt: now,
        updatedAt: null,
      },
      {
        id: `ti-${tenant2}`,
        tenantId: tenant2,
        email: `e2e-vis-inv2-${stamp}@example.com`,
        roleKey: 'member',
        invitorId: null,
        status: 'pending',
        token: `tok-vis-${stamp}-c`,
        expiresAt: null,
        createdAt: now,
        updatedAt: null,
      },
    ] as never);

    // T1（shared）上下文零手写谓词：三表均只见本租一行——他租行经机制地板不可见。
    const floored = await tenantIsolationStorage.run(
      scope({ tenantId, organizationId: orgA }),
      async () => {
        const em = await mikro.fork();
        return {
          members: await em.find(TenantMembership, {} as never),
          assignments: await em.find(TenantRoleAssignment, {} as never),
          invitations: await em.find(TenantInvitation, {} as never),
        };
      },
    );
    expect(floored.members.map((r) => r.tenantId)).toEqual([tenantId]);
    expect(floored.assignments.map((r) => r.tenantId)).toEqual([tenantId]);
    expect(floored.invitations.map((r) => r.tenantId)).toEqual([tenantId]);

    // scoped:false 治理/名册面：跨租全见（X1 目录/R3 切租面同口径）。
    const govEm = await mikro.fork({ scoped: false });
    expect(await govEm.count(TenantMembership, {} as never)).toBeGreaterThanOrEqual(2);
    expect(await govEm.count(TenantRoleAssignment, {} as never)).toBeGreaterThanOrEqual(2);
    expect(await govEm.count(TenantInvitation, {} as never)).toBeGreaterThanOrEqual(2);

    // 未装参 em 读新在册实体 → v7 抛「No arguments provided」（P0 D2① 同形·防升级漂移）。
    const rawEm = await mikro.newTransactionEm();
    await expect(rawEm.find(TenantMembership, {} as never)).rejects.toThrow(
      /No arguments provided for filter/,
    );
  }, 60000);
});

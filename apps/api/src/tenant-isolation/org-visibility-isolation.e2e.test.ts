import 'reflect-metadata';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
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
});

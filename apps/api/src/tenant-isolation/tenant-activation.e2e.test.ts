import 'reflect-metadata';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Session, User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { SetSessionActiveTenantCommand } from '@app/modules/organizations/application/commands/set-session-active-tenant.command';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import {
  type TenantIsolationScope,
  tenantIsolationStorage,
} from '@core/saas-kit/tenant-isolation/tenant-isolation-scope';
import { ForbiddenException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

/**
 * 租户激活解绑 **真库端到端**（第三次层级复裁 切片 4·D7·env-gated）。
 *
 * 证 D7「org 绑架」解除的三条硬语义：
 *  - **租级激活可写且解绑**：`SetSessionActiveTenantCommand`（成员 U1）把会话 `activeTenantId` 落目标租，
 *    同时**清 `activeOrganizationId`**（选租与选 org 互斥·不再被活动 org 绑架）；
 *  - **fail-closed 防跨租提权**：非目标租成员（U1 ∉ T2）设活动租 → 抛 `ForbiddenException`·会话真列纹丝不动
 *    （绝不信任未校成员资格的 tenantId 直落会话）；
 *  - **租级端点可达不依赖活动 org**：仅以 `tenantId` 绑 ALS（`organizationId` 缺席·复刻显式 activeTenantId
 *    解析链下游）读工作区，filter 按租隔离——T 上下文读不见 T2（`tenantId` 永不放松的跨租硬地板）。
 *
 * 另证向后兼容：写行查无（bogus sessionId）→ null（控制层转 401）。
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行·夹具 afterAll 清净·时间戳后缀保幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('租户激活解绑端到端（D7·设活动租/清活动 org/跨租 fail-closed/租级可达 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let bus: CommandBus;

  const stamp = Date.now();
  const tenantId = uuidv7(); // T·shared·U1 所属
  const tenant2 = uuidv7(); // T2·isolated·U2 所属（U1 非成员）
  const orgA = uuidv7(); // ∈ T
  const orgB = uuidv7(); // ∈ T2
  const wsA = uuidv7(); // ∈ T/orgA
  const wsC = uuidv7(); // ∈ T2/orgB
  const u1 = uuidv7();
  const u2 = uuidv7();
  const s1 = uuidv7(); // U1 会话·初始 activeOrganizationId=orgA·activeTenantId=NULL

  const readSession = async (id: string) => {
    const em = await mikro.fork({ scoped: false });
    return em.findOne(Session, { id } as never);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    mikro = app.get(MikroOrmService);
    bus = app.get(CommandBus);

    const now = new Date();
    const em = await mikro.fork({ scoped: false });
    await em.insert(Tenant, [
      {
        id: tenantId,
        name: `E2E Act T ${stamp}`,
        slug: `e2e-act-${stamp}`,
        status: 'active',
        orgVisibility: 'shared',
        createdAt: now,
        updatedAt: null,
      },
      {
        id: tenant2,
        name: `E2E Act T2 ${stamp}`,
        slug: `e2e-act-t2-${stamp}`,
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
        tenantId: tenant2,
        name: `B ${stamp}`,
        slug: `b-${stamp}`,
        createdAt: now,
        updatedAt: null,
      },
    ] as never);
    await em.insert(User, [
      {
        id: u1,
        name: 'U1',
        email: `u1-${stamp}@e2e.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: u2,
        name: 'U2',
        email: `u2-${stamp}@e2e.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ] as never);
    await em.insert(Member, [
      { id: uuidv7(), organizationId: orgA, userId: u1, role: 'member', createdAt: now },
      { id: uuidv7(), organizationId: orgB, userId: u2, role: 'member', createdAt: now },
    ] as never);
    await em.insert(Session, [
      {
        id: s1,
        expiresAt: new Date(now.getTime() + 86400000),
        token: `tok-${stamp}-s1`,
        userId: u1,
        activeOrganizationId: orgA,
        activeTenantId: null,
        createdAt: now,
        updatedAt: now,
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
        id: wsC,
        tenantId: tenant2,
        organizationId: orgB,
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
    await em.nativeDelete(Workspace, { id: { $in: [wsA, wsC] } } as never);
    await em.nativeDelete(Session, { id: { $in: [s1] } } as never);
    await em.nativeDelete(Member, { userId: { $in: [u1, u2] } } as never);
    await em.nativeDelete(User, { id: { $in: [u1, u2] } } as never);
    await em.nativeDelete(Organization, { id: { $in: [orgA, orgB] } } as never);
    await em.nativeDelete(Tenant, { id: { $in: [tenantId, tenant2] } } as never);
    await app.close();
  });

  it('D7 解绑：设活动租落 activeTenantId 且清 activeOrganizationId（选租与选 org 互斥）', async () => {
    const result = await bus.execute<SetSessionActiveTenantCommand>(
      new SetSessionActiveTenantCommand(u1, s1, tenantId),
    );
    expect(result).toEqual({ tenantId });
    const row = await readSession(s1);
    expect(row?.activeTenantId).toBe(tenantId);
    // org 绑架解除：切租同时清空活动组织（不再被 activeOrganizationId 派生轴牵着走）。
    expect(row?.activeOrganizationId).toBeNull();
  }, 60000);

  it('D7 fail-closed：非目标租成员设活动租 → 抛 Forbidden·会话真列纹丝不动', async () => {
    const before = await readSession(s1);
    const beforeTenant = before?.activeTenantId;
    await expect(
      bus.execute<SetSessionActiveTenantCommand>(
        new SetSessionActiveTenantCommand(u1, s1, tenant2),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const after = await readSession(s1);
    expect(after?.activeTenantId).toBe(beforeTenant);
    expect(after?.activeTenantId).not.toBe(tenant2);
  }, 60000);

  it('D7 向后兼容：bogus sessionId（成员资格过但写行查无）→ null（控制层转 401）', async () => {
    const result = await bus.execute<SetSessionActiveTenantCommand>(
      new SetSessionActiveTenantCommand(u1, uuidv7(), tenantId),
    );
    expect(result).toBeNull();
  }, 60000);

  it('D7 租级可达：仅绑 tenantId（无活动 org）→ filter 按租隔离·读不见跨租（硬地板不依赖 org）', async () => {
    // 复刻显式 activeTenantId 解析链下游：ALS 携 tenantId 而 organizationId 缺席。
    const readVisible = (ctx: TenantIsolationScope): Promise<string[]> =>
      tenantIsolationStorage.run(ctx, async () => {
        const em = await mikro.fork();
        const rows = (await em.find(Workspace, {} as never, { fields: ['id'] as never })) as {
          id: string;
        }[];
        return rows.map((r) => r.id);
      });
    // T 上下文（shared·无 org）：见本租 wsA，读不见跨租 wsC（shared 仅租户地板）。
    const inT = await readVisible({ userId: u1, tenantId, orgVisibility: 'shared' });
    expect(inT).toContain(wsA);
    expect(inT).not.toContain(wsC);
    // T2 上下文（isolated·无 org）：P0 X3 收紧——org-partitioned 读面（Workspace）无活动 org 时
    // fail-closed 拒所有（宁不读也不跨 org 泄露），故空集：既不含跨租 wsA，亦不含本租 wsC。
    // 硬地板恒成立（绝不见他租）；要读本租 org-partitioned 内容须先激活某 org（隔离租户机密维）。
    const inT2 = await readVisible({ userId: u2, tenantId: tenant2, orgVisibility: 'isolated' });
    expect(inT2).toEqual([]);
  }, 60000);
});

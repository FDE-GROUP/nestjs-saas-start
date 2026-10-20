import 'reflect-metadata';
import { Organization } from '@app/database/ba/entities';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.service';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { Tenant } from './infrastructure/entities/tenant.entity';

/**
 * `tenant` 户籍表 · env-gated 真库 e2e（global-tenant-entity-reclamation 切片 B · 人签 2026-10-20）：
 * 本测是换轨后 **DB 级语义**的唯一实据面——单测全 mock，证不了 CHECK 约束/FK cascade/
 * 「无户籍兑底」三件事（方案 §5 验收判据「列约束负向测」在此落账）。
 *
 * 坐实四件：
 *  1. 迁移即入册：`transition` 对无户籍存量 org 生效——`tenant` 行 upsert 生成、
 *     `updatedAt` 必盖戳、**BA `organization` 面零触碰**（metadata 不携 status·收权实证）；
 *  2. DB CHECK 负向：直写非法 status → `tenant_status_check` 违例红（值域防线在 DB 层）；
 *  3. deny-list 无户籍语义：`isBlocked` 对无租户行 org 不拦（存量/seeded 兼容·逐字等价旧链）；
 *  4. FK cascade：主行 `organization` 硬删 → `tenant` 户籍行随灭（六子表入账）。
 *
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行（开关），不破默认 CI 的 DB-free 不变量。
 * 夹具时间戳后缀唯一键，afterAll 显式清净，运行幂等。B1 隔离：节掉 outbox 后台轮询
 * （沿 `tenant-hard-delete.e2e.test.ts` 同文件先例）。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('tenant 户籍表真库语义（收权案切片 B · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let statusService: TenantStatusService;

  const stamp = Date.now();
  const orgId = `e2e-tt-org-${stamp}`;
  const bareOrgId = `e2e-tt-bare-${stamp}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    // 必须建真实 Fastify 应用（同 tenant-hard-delete.e2e 先例）：AppModule 的 AuthBootstrapService
    // 在 onApplicationBootstrap 挂 BA 原生路由，裸 TestingModule.init() 下 `httpAdapter.getInstance()`
    // 为 undefined 会崩（`res.header is not a function` → process.exit）；无需 listen。
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    mikro = app.get(MikroOrmService);
    statusService = app.get(TenantStatusService);

    const em = await mikro.fork();
    await em.insert(Organization, {
      id: orgId,
      name: `TT ${stamp}`,
      slug: `tt-${stamp}`,
      metadata: {},
    } as never);
    await em.insert(Organization, {
      id: bareOrgId,
      name: `TT bare ${stamp}`,
      slug: `tt-bare-${stamp}`,
      metadata: {},
    } as never);
  }, 120000);

  afterAll(async () => {
    const em = await mikro.fork();
    // 主行硬删即全清（FK cascade 自证之外亦作清净通道）
    await em.nativeDelete(Tenant, { id: { $in: [orgId, bareOrgId] } } as never);
    await em.nativeDelete(Organization, { id: { $in: [orgId, bareOrgId] } } as never);
    await app.close();
  });

  it('①transition 对无户籍存量 org 入册：tenant 行生成·updatedAt 盖戳·BA 面零触碰', async () => {
    const result = await statusService.transition(orgId, TENANT_STATUS.SUSPENDED);
    expect(result).toEqual({ kind: 'ok', previous: undefined, status: TENANT_STATUS.SUSPENDED });
    const em = await mikro.fork();
    const row = await em.findOne(Tenant, { id: orgId } as never);
    expect(row?.status).toBe(TENANT_STATUS.SUSPENDED);
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.updatedAt).toBeInstanceOf(Date);
    // 收权实证：organization.metadata 不携 status（BA 缩回纯认证/成员数据源）
    const org = await em.findOne(Organization, orgId);
    expect((org?.metadata ?? {}) as Record<string, unknown>).not.toHaveProperty('status');
    expect(await statusService.isBlocked(orgId)).toBe(true);
  });

  it('②DB CHECK 负向：直写非法 status 即红（值域防线在 DB 层·tenant_status_check）', async () => {
    const em = await mikro.fork();
    await expect(
      em.nativeUpdate(Tenant, { id: orgId } as never, { status: 'bogus' } as never),
    ).rejects.toThrow(/tenant_status_check/);
  });

  it('③deny-list 无户籍语义：read undefined·不拦（存量/seeded 兼容·等价旧「无状态记录」）', async () => {
    expect(await statusService.read(bareOrgId)).toBeUndefined();
    expect(await statusService.isBlocked(bareOrgId)).toBe(false);
  });

  it('④FK cascade：主行硬删 → 户籍行随灭', async () => {
    const em = await mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: orgId } as never);
    expect(affected).toBe(1);
    expect(await em.findOne(Tenant, { id: orgId } as never)).toBeNull();
    // not-found 判据随本体消灭（户籍行本已无存）
    expect(await statusService.transition(orgId, TENANT_STATUS.ACTIVE)).toEqual({
      kind: 'not-found',
    });
  });
});

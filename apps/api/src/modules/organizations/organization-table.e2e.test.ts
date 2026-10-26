import 'reflect-metadata';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * `organization.status` 列 · env-gated 真库 e2e（rehierarchy 片二 K1 语义收口）：本测是
 * `organization.status` 归为**组织自有轻量态**后的 **DB 级语义**唯一实据面——单测全 mock，证不了
 * 列默认值/CHECK 约束两件事。治理生命周期权威态已随片一「上移归位 `tenant.status`」（生命周期读写
 * 卡点是 `TenantStatusService`·`OrganizationStatusService` 死服务退役），本测因此**去服务耦合**、
 * 仅以 `em` 直插/直更坐实列层契约：
 *  1. 默认入册：直插 `organization` 行（不携 status）→ DB 默认 'active' 落地（缺席态消失·O1 已堵）；
 *  2. DB CHECK 负向：直写非法 status → `organization_status_check` 违例红（值域防线在 DB 层）；
 *  3. metadata 零寄居：自有态走真列·`metadata` 不携 status 键（BA 面零我方寄居键）。
 *
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行（开关），不破默认 CI 的 DB-free 不变量。
 * 夹具时间戳后缀唯一键，afterAll 显式清净，运行幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('organization.status 自有态真列库语义（片二 K1 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;

  const stamp = Date.now();
  const orgId = `e2e-tt-org-${stamp}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    // 必须建真实 Fastify 应用（同 organization-hard-delete.e2e 先例）：AppModule 的 AuthBootstrapService
    // 在 onApplicationBootstrap 挂 BA 原生路由，裸 TestingModule.init() 下 `httpAdapter.getInstance()`
    // 为 undefined 会崩（`res.header is not a function` → process.exit）；无需 listen。
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    mikro = app.get(MikroOrmService);

    // 直插 organization（不携 status）——验证列 DB 默认 'active' 落地（缺席态消失·O1 已堵）。
    const em = await mikro.fork();
    await em.insert(Organization, {
      id: orgId,
      name: `TT ${stamp}`,
      slug: `tt-${stamp}`,
      metadata: {},
    } as never);
  }, 120000);

  afterAll(async () => {
    const em = await mikro.fork();
    await em.nativeDelete(Organization, { id: { $in: [orgId] } } as never);
    await app.close();
  });

  it('①默认入册：新 org status 默认 active（列缺省兑底·metadata 零我方寄居键）', async () => {
    const em = await mikro.fork();
    const org = await em.findOne(Organization, { id: orgId } as never);
    expect(org?.status).toBe(ORGANIZATION_STATUS.ACTIVE);
    // 自有态在 organization.status 真列·metadata 不携 status（BA 面零我方寄居键）
    expect((org?.metadata ?? {}) as Record<string, unknown>).not.toHaveProperty('status');
  });

  it('②DB CHECK 负向：直写非法 status 即红（值域防线在 DB 层·organization_status_check）', async () => {
    const em = await mikro.fork();
    await expect(
      em.nativeUpdate(Organization, { id: orgId } as never, { status: 'bogus' } as never),
    ).rejects.toThrow(/organization_status_check/);
  });

  it('③自有态可直写合法值（active↔suspended 皆过 CHECK·治理权威态另见 tenant.status）', async () => {
    const em = await mikro.fork();
    await em.nativeUpdate(
      Organization,
      { id: orgId } as never,
      {
        status: ORGANIZATION_STATUS.SUSPENDED,
      } as never,
    );
    const org = await em.findOne(Organization, { id: orgId } as never);
    expect(org?.status).toBe(ORGANIZATION_STATUS.SUSPENDED);
  });
});

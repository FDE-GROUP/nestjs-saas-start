import 'reflect-metadata';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Organization } from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * `organization.status` 治理真列 · env-gated 真库 e2e（global-governance-lifecycle-consolidation 切片 B·
 * 原 `tenant` 旁表已 DROP）：本测是归列后 **DB 级语义**的唯一实据面——单测全 mock，证不了列默认值/
 * CHECK 约束/迁移写入三件事（方案 §5 验收判据「列约束负向测」在此落账）。
 *
 * 坠实三件：
 *  1. 默认入册：BA/本测直插 `organization` 行（不携 status）→ DB 默认 'active' 落地（缺席态消失·O1 已堵）；
 *     `transition` 对存量 org 生效——前置态取 'active'（非 undefined）、直写 `organization.status`；
 *  2. DB CHECK 负向：直写非法 status → `organization_status_check` 违例红（值域防线在 DB 层）；
 *  3. deny-list 读语义：`read` 对新建 org 返 'active'（非 undefined）·不拦；本体硬删 → not-found。
 *
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行（开关），不破默认 CI 的 DB-free 不变量。
 * 夹具时间戳后缀唯一键，afterAll 显式清净，运行幂等。B1 隔离：节掉 outbox 后台 轮询
 * （沿 `tenant-hard-delete.e2e.test.ts` 同文件先例）。
 *
 * 治理面 ES 覆盖层已随切片 D 退役（租户态不再「回放即真相」），本测无旋钮分支口径。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('organization.status 治理真列库语义（归列切片 B · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let statusService: OrganizationStatusService;

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
    statusService = app.get(OrganizationStatusService);

    // 直插 organization（不携 status）——验证列 DB 默认 'active' 落地（缺席态消失·O1 已堵）。
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
    await em.nativeDelete(Organization, { id: { $in: [orgId, bareOrgId] } } as never);
    await app.close();
  });

  it('①默认入册：新 org status 默认 active；transition 前置态取 active（非 undefined）·直写 organization.status', async () => {
    const result = await statusService.transition(orgId, ORGANIZATION_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'ok',
      previous: ORGANIZATION_STATUS.ACTIVE,
      status: ORGANIZATION_STATUS.SUSPENDED,
    });
    const em = await mikro.fork();
    const org = await em.findOne(Organization, { id: orgId } as never);
    expect(org?.status).toBe(ORGANIZATION_STATUS.SUSPENDED);
    // 归列实证：生命周期态在 organization.status 真列·metadata 不携 status（BA 面零我方寄居键）
    expect((org?.metadata ?? {}) as Record<string, unknown>).not.toHaveProperty('status');
    expect(await statusService.isBlocked(orgId)).toBe(true);
  });

  it('②DB CHECK 负向：直写非法 status 即红（值域防线在 DB 层·organization_status_check）', async () => {
    const em = await mikro.fork();
    await expect(
      em.nativeUpdate(Organization, { id: orgId } as never, { status: 'bogus' } as never),
    ).rejects.toThrow(/organization_status_check/);
  });

  it('③deny-list 读语义：新建 org read 返 active（非 undefined）·不拦', async () => {
    expect(await statusService.read(bareOrgId)).toBe(ORGANIZATION_STATUS.ACTIVE);
    expect(await statusService.isBlocked(bareOrgId)).toBe(false);
  });

  it('④本体硬删 → not-found（归列后判据即本体行存在性·旁表已消）', async () => {
    const em = await mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: orgId } as never);
    expect(affected).toBe(1);
    expect(await em.findOne(Organization, { id: orgId } as never)).toBeNull();
    // not-found 判据随本体消灭
    expect(await statusService.transition(orgId, ORGANIZATION_STATUS.ACTIVE)).toEqual({
      kind: 'not-found',
    });
  });
});

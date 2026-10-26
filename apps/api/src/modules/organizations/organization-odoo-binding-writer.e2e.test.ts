import 'reflect-metadata';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import {
  ORGANIZATION_ODOO_BINDING_READER,
  type OrganizationOdooBindingReader,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import {
  ORGANIZATION_ODOO_BINDING_WRITER,
  type OrganizationOdooBindingWriter,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-writer';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * 绑定状态推进写入端口（published port）· env-gated 真库 e2e（module-org-odoo-company-mapping 切片 C · §2.3/§2.6）。
 *
 * 锁 saga 赖以推进的**库级状态机半**——真 `MikroOrganizationGovernanceRepository` 经 `@core` published
 * port `ORGANIZATION_ODOO_BINDING_WRITER` 落 `provisioning`/`ready`/`failed` 三态与快照列，`@core` reader
 * 端口回读到与写入一致的终态（saga 编排逻辑由 `features/odoo-provisioning` 侧 stub 单测锁·两者合起来即
 * 切片 C 的「先落意图→回写/失败」全链）。写路径落本上下文而非 feature：features 禁深引上下文 domain/infra，
 * 且本测需直接断言 `odooFailureReason` 列（reader 行不携该列·属 doctor/可观测面）。
 *
 * 逐格：
 *  1. beginProvisioning → reader 回读 `provisioning`（意图持久化·公司 id 仍空）；
 *  2. markReady → reader 回读 `ready` + companyId/name + boundAt 非空 + 失败原因清空（`canUseOdoo` 前置就绪）；
 *  3. markFailed（携原因）→ reader 回读 `failed`，实体列 `odooFailureReason` = 传入原因（保留既有 companyId）；
 *  4. 幂等重入：对同租户再 beginProvisioning → 仍 `provisioning`（目标态幂等·不叠加副作用）。
 *
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行。公司 id 取 int4 域内时间戳派生（不撞他夹具），
 * afterAll 显式清净，运行幂等。B1 隔离：掐掉 outbox 后台轮询。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('租户↔Odoo 绑定推进端口库语义（映射切片 C · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let reader: OrganizationOdooBindingReader;
  let writer: OrganizationOdooBindingWriter;

  const stamp = Date.now();
  const org = `e2e-wrt-a-${stamp}`;
  const companyBase = 200000 + (stamp % 1700000000);
  const companyId = companyBase;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    mikro = app.get(MikroOrmService);
    reader = app.get(ORGANIZATION_ODOO_BINDING_READER);
    writer = app.get(ORGANIZATION_ODOO_BINDING_WRITER);

    const em = await mikro.fork();
    await em.insert(Organization, {
      id: org,
      name: `WRT ${org}`,
      slug: `wrt-a-${stamp}`,
      metadata: {},
    } as never);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    await em.nativeDelete(Organization, { id: org } as never);
    await app.close();
  });

  it('①beginProvisioning → reader 回读 provisioning（意图已落·公司 id 仍空）', async () => {
    await writer.beginProvisioning(org);
    const row = await reader.read(org);
    expect(row?.odooBindingStatus).toBe(ORGANIZATION_ODOO_BINDING_STATUS.PROVISIONING);
    expect(row?.odooCompanyId).toBeNull();
  });

  it('②markReady → reader 回读 ready + companyId/name + boundAt 非空', async () => {
    await writer.markReady(org, { odooCompanyId: companyId, odooCompanyName: '开通公司' });
    const row = await reader.read(org);
    expect(row?.odooBindingStatus).toBe(ORGANIZATION_ODOO_BINDING_STATUS.READY);
    expect(row?.odooCompanyId).toBe(companyId);
    expect(row?.odooCompanyName).toBe('开通公司');
    expect(row?.odooBoundAt).toBeInstanceOf(Date);
  });

  it('③markFailed（携原因）→ reader 回读 failed · 实体列 odooFailureReason 落值 · 保留既有 companyId', async () => {
    await writer.markFailed(org, '本地化基线失败：module base 未装');
    const row = await reader.read(org);
    expect(row?.odooBindingStatus).toBe(ORGANIZATION_ODOO_BINDING_STATUS.FAILED);
    // 失败态下 companyId 不被 writer 抹除（回找/doctor 需凭它定位）——reader 仍回读得旧值。
    expect(row?.odooCompanyId).toBe(companyId);
    const em = await mikro.fork();
    em.clear();
    const entity = await em.findOneOrFail(Organization, { id: org } as never);
    expect(entity.odooFailureReason).toBe('本地化基线失败：module base 未装');
  });

  it('④幂等重入：再次 beginProvisioning → 仍 provisioning（目标态幂等·不叠加副作用）', async () => {
    await writer.beginProvisioning(org);
    const first = await reader.read(org);
    await writer.beginProvisioning(org);
    const second = await reader.read(org);
    expect(first?.odooBindingStatus).toBe(ORGANIZATION_ODOO_BINDING_STATUS.PROVISIONING);
    expect(second?.odooBindingStatus).toBe(ORGANIZATION_ODOO_BINDING_STATUS.PROVISIONING);
  });
});

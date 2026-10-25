import 'reflect-metadata';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '@app/modules/organizations/domain/repositories/organization-governance.repository';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * 租户↔Odoo 公司绑定列组 · env-gated 真库 e2e（module-org-odoo-company-mapping 切片 A）。
 *
 * 坠实四件（单测全 mock·DB 级语义只能在此实据）：
 *  1. bind-existing 正向：端口 `bindOdooCompany` 落 ready + 公司 id/名称快照/绑定时间；
 *  2. 双射冲突：同一公司被**其它**租户占用 → `conflict`（应用层预检查路径）；
 *  3. 库级终防线：绕过预检查直写已占用 `odooCompanyId` → unique 违例红（并发 TOCTOU 窗的兜底）；
 *  4. DB CHECK 负向：直写非法绑定态 → `organization_odoo_binding_status_check` 违例（值域防线在 DB 层）。
 *
 * 幂等口径另证：同租户重复绑定同公司 = `bound` 成功（覆盖快照）。
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行，不破默认 CI 的 DB-free 不变量。
 * 夹具时间戳后缀唯一键（公司 id 取高位区间避与真实/他夹具相撞），afterAll 显式清净，运行幂等。
 * B1 隔离：掐掉 outbox 后台轮询（沿 `organization-table.e2e.test.ts` 先例）。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('organization Odoo 公司绑定列组库语义（映射切片 A · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let governance: OrganizationGovernanceRepository;

  const stamp = Date.now();
  const orgA = `e2e-ob-a-${stamp}`;
  const orgB = `e2e-ob-b-${stamp}`;
  // 公司 id 列实存为 int4（Odoo res.company id 同型）：取模落域内，低位随时间戳变保证跨运行不撞。
  const companyBase = 100000 + (stamp % 1900000000);
  const companyA = companyBase;
  const companyB = companyBase + 1;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OutboxRelay)
      .useValue({
        onApplicationBootstrap: () => {},
        onModuleDestroy: () => {},
        tickOnce: async () => 0,
      })
      .compile();
    // 必须建真实 Fastify 应用（沿 organization-table.e2e 先例：AuthBootstrapService 挂 BA 原生路由）。
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    mikro = app.get(MikroOrmService);
    governance = app.get(ORGANIZATION_GOVERNANCE_REPOSITORY);

    const em = await mikro.fork();
    for (const [id, slug] of [
      [orgA, `ob-a-${stamp}`],
      [orgB, `ob-b-${stamp}`],
    ] as const) {
      await em.insert(Organization, { id, name: `OB ${id}`, slug, metadata: {} } as never);
    }
  }, 120000);

  afterAll(async () => {
    const em = await mikro.fork();
    await em.nativeDelete(Organization, { id: { $in: [orgA, orgB] } } as never);
    await app.close();
  });

  it('①bind-existing 正向：绑定直落 ready，回执携公司 id/名称快照/绑定时间', async () => {
    const outcome = await governance.bindOdooCompany(orgA, {
      odooCompanyId: companyA,
      odooCompanyName: '演示公司 A',
    });
    expect(outcome.kind).toBe('bound');
    if (outcome.kind !== 'bound') return;
    expect(outcome.binding).toEqual({
      organizationId: orgA,
      odooCompanyId: companyA,
      odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.READY,
      odooCompanyName: '演示公司 A',
      odooBoundAt: expect.any(Date),
    });
  });

  it('②双射冲突：公司已被他租户占用 → conflict，占用方绑定不受影响', async () => {
    const conflict = await governance.bindOdooCompany(orgB, {
      odooCompanyId: companyA,
      odooCompanyName: '抢绑尝试',
    });
    expect(conflict.kind).toBe('conflict');
    const em = await mikro.fork();
    const org = await em.findOne(Organization, { id: orgA } as never);
    expect(org?.odooCompanyId).toBe(companyA);
  });

  it('③库级终防线：绕过预检查直写已占用公司 id → unique 违例红（一租户一公司兜底）', async () => {
    const em = await mikro.fork();
    await expect(
      em.nativeUpdate(Organization, { id: orgB } as never, { odooCompanyId: companyA } as never),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('④DB CHECK 负向：非法绑定态直写即红（organization_odoo_binding_status_check）', async () => {
    const em = await mikro.fork();
    await expect(
      em.nativeUpdate(Organization, { id: orgB } as never, { odooBindingStatus: 'bogus' } as never),
    ).rejects.toThrow(/organization_odoo_binding_status_check/);
  });

  it('⑤幂等：同租户重复绑定同公司 → bound（覆盖快照不报错）；空绑公司 B 亦成功', async () => {
    const again = await governance.bindOdooCompany(orgA, {
      odooCompanyId: companyA,
      odooCompanyName: '演示公司 A（改名快照）',
    });
    expect(again.kind).toBe('bound');
    if (again.kind === 'bound')
      expect(again.binding.odooCompanyName).toBe('演示公司 A（改名快照）');

    const fresh = await governance.bindOdooCompany(orgB, {
      odooCompanyId: companyB,
      odooCompanyName: '演示公司 B',
    });
    expect(fresh.kind).toBe('bound');
  });
});

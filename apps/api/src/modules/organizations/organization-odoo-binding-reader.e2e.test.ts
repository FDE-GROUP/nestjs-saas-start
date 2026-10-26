import 'reflect-metadata';
import { OutboxRelay } from '@app/database/eventing/outbox-relay';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  ORGANIZATION_GOVERNANCE_REPOSITORY,
  type OrganizationGovernanceRepository,
} from '@app/modules/organizations/domain/repositories/organization-governance.repository';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import {
  canUseOdoo,
  ORGANIZATION_ODOO_BINDING_STATUS,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import {
  ORGANIZATION_ODOO_BINDING_READER,
  type OrganizationOdooBindingReader,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * 绑定读取端口（published port）· env-gated 真库 e2e（module-org-odoo-company-mapping 切片 B · §2.5）。
 *
 * 泄露矩阵的「DB 真相半」：RPC company 域注入（`OdooReadService` 拼 `['company_id','=',cid]`）由
 * `apps/api/src/features/odoo-rpc-api/application/odoo-read.service.test.ts`（stub 单测·domain 注入
 * 不可绕过逐格）锁；本测锁**喂给那道注入的绑定解析**——真 `MikroOrganizationGovernanceRepository.read`
 * 经 `@core` published port `ORGANIZATION_ODOO_BINDING_READER` 按会话租户返回正确绑定行，`canUseOdoo`
 * 对其裁决与 `OdooReadService.resolveReadyCompanyId` 同式（字段名 `organizationStatus`→`status` 显式对齐·
 * 防错位漏检），从而坐实「A 组织解析到 A 公司、B 组织解析到 B 公司、无绑定/暂停一律 fail-closed」——
 * 这是 features 侧读不到的库级事实（features 禁深引上下文 domain/infrastructure，故落本上下文）。
 *
 * 矩阵逐格（与 RPC 门禁共享同一 `canUseOdoo` 单源裁决）：
 *  1. A：read 得 ready + companyA + active → `canUseOdoo` 真；且携 A 公司 id（≠ B 公司 id·互不串）；
 *  2. B：read 得 ready + companyB → 携 B 公司 id（同实例按租户派生·绝不返 A 的）；
 *  3. 无绑定租户：read 得 odooCompanyId=null/odooBindingStatus=null → `canUseOdoo` 假（fail-closed）；
 *  4. 暂停租户携 ready 绑定：organizationStatus=suspended → `canUseOdoo` 假（治理态透传生效）；
 *  5. 查无租户：read → null（调用方 fail-closed 处置）。
 *
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行。公司 id 取 int4 域内时间戳派生（不撞他夹具），
 * afterAll 显式清净，运行幂等。B1 隔离：掐掉 outbox 后台轮询。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('租户↔Odoo 绑定读取端口库语义（映射切片 B · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let governance: OrganizationGovernanceRepository;
  let reader: OrganizationOdooBindingReader;

  const stamp = Date.now();
  const orgA = `e2e-rdp-a-${stamp}`;
  const orgB = `e2e-rdp-b-${stamp}`;
  const orgNoBinding = `e2e-rdp-c-${stamp}`;
  const orgSuspended = `e2e-rdp-d-${stamp}`;
  const companyBase = 100000 + (stamp % 1900000000);
  const companyA = companyBase;
  const companyB = companyBase + 1;
  const companySuspended = companyBase + 2;

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
    governance = app.get(ORGANIZATION_GOVERNANCE_REPOSITORY);
    // published port（Symbol token）：装配根 useExisting 到同一治理仓储实例（@Global 导出）。
    reader = app.get(ORGANIZATION_ODOO_BINDING_READER);

    const em = await mikro.fork();
    for (const [id, slug] of [
      [orgA, `rdp-a-${stamp}`],
      [orgB, `rdp-b-${stamp}`],
      [orgNoBinding, `rdp-c-${stamp}`],
      [orgSuspended, `rdp-d-${stamp}`],
    ] as const) {
      await em.insert(Organization, { id, name: `RDP ${id}`, slug, metadata: {} } as never);
    }
    await governance.bindOdooCompany(orgA, { odooCompanyId: companyA, odooCompanyName: 'A 公司' });
    await governance.bindOdooCompany(orgB, { odooCompanyId: companyB, odooCompanyName: 'B 公司' });
    await governance.bindOdooCompany(orgSuspended, {
      odooCompanyId: companySuspended,
      odooCompanyName: 'D 公司（暂停）',
    });
    await em.nativeUpdate(
      Organization,
      { id: orgSuspended } as never,
      { status: TENANCY_STATUS.SUSPENDED } as never,
    );
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    await em.nativeDelete(Organization, {
      id: { $in: [orgA, orgB, orgNoBinding, orgSuspended] },
    } as never);
    await app.close();
  });

  it('①A 组织：read 得 ready/A 公司/active → canUseOdoo 真', async () => {
    const row = await reader.read(orgA);
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.odooCompanyId).toBe(companyA);
    expect(row.odooBindingStatus).toBe(ORGANIZATION_ODOO_BINDING_STATUS.READY);
    expect(row.organizationStatus).toBe(TENANCY_STATUS.ACTIVE);
    expect(
      canUseOdoo({
        status: row.organizationStatus,
        odooBindingStatus: row.odooBindingStatus,
        odooCompanyId: row.odooCompanyId,
      }),
    ).toBe(true);
  });

  it('②B 组织：read 携 B 公司 id（同实例按租户派生·绝不返 A 的公司·互不串）', async () => {
    const rowB = await reader.read(orgB);
    expect(rowB?.odooCompanyId).toBe(companyB);
    expect(rowB?.odooCompanyId).not.toBe(companyA);
  });

  it('③无绑定租户：odooCompanyId/odooBindingStatus 皆 null → canUseOdoo 假（fail-closed）', async () => {
    const row = await reader.read(orgNoBinding);
    expect(row?.odooCompanyId).toBeNull();
    expect(row?.odooBindingStatus).toBeNull();
    if (!row) return;
    expect(
      canUseOdoo({
        status: row.organizationStatus,
        odooBindingStatus: row.odooBindingStatus,
        odooCompanyId: row.odooCompanyId,
      }),
    ).toBe(false);
  });

  it('④暂停租户携 ready 绑定：organizationStatus=suspended → canUseOdoo 假（治理态透传·防字段错位漏检）', async () => {
    const row = await reader.read(orgSuspended);
    expect(row?.odooBindingStatus).toBe(ORGANIZATION_ODOO_BINDING_STATUS.READY);
    expect(row?.organizationStatus).toBe(TENANCY_STATUS.SUSPENDED);
    if (!row) return;
    expect(
      canUseOdoo({
        status: row.organizationStatus,
        odooBindingStatus: row.odooBindingStatus,
        odooCompanyId: row.odooCompanyId,
      }),
    ).toBe(false);
  });

  it('⑤查无租户：read → null（调用方 fail-closed 处置）', async () => {
    expect(await reader.read(`nope-${stamp}`)).toBeNull();
  });
});

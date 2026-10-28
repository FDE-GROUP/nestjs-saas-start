import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import type {
  OrganizationOdooBindingReader,
  OrganizationOdooBindingRow,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { describe, expect, it } from 'vitest';
import type { ConfigService } from '../../../config/config.service';
import { OdooReadService } from '../application/odoo-read.service';
import { OdooJsonClient } from '../infrastructure/odoo-json.client';

/**
 * 活体链 e2e（env-gated·真 Odoo）：OdooJsonClient → OdooReadService 全链打真实例，
 * 锁「鉴权 → search_read/search_count → 白名单视图」端到端形状。
 *
 * 门：`ODOO_E2E_BASE_URL` 未置即整体 skip（公共机器/无 Odoo 链绿跳过——与
 * GATED_E2E_FILES 恒等闸协同：文件登记于清单，在场与否由叠加层状态决定）。
 * 凭证来源 = 运行环境注入（demo 实例的本机 key），本文件不含任何真实凭证值。
 * 已登记 scripts/ci-fullstack.ts GATED_E2E_FILES（私有机器 `pnpm run ci:db` 真链跑）。
 */
const BASE_URL = process.env.ODOO_E2E_BASE_URL ?? '';
const describeLive = BASE_URL ? describe : describe.skip;

function liveService(): OdooReadService {
  const env: Record<string, string> = {
    ODOO_BASE_URL: BASE_URL,
    ODOO_DB: process.env.ODOO_E2E_DB ?? 'odoo-demo',
    ODOO_LOGIN: process.env.ODOO_E2E_LOGIN ?? '',
    ODOO_API_KEY: process.env.ODOO_E2E_API_KEY ?? '',
  };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  // 切片 B：读用例现经会话租户→绑定解析公司域。活体链用固定 demo bake 公司 id
  //（默 1＝Odoo 根公司），tenant / binding reader 以 stub 顶替（不触平台库）。
  const cid = Number(process.env.ODOO_E2E_COMPANY_ID ?? '1');
  const binding: OrganizationOdooBindingRow = {
    organizationId: 'e2e-live-org',
    odooCompanyId: cid,
    odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.READY,
    odooCompanyName: 'Demo Company',
    odooBoundAt: new Date(),
    organizationStatus: TENANT_STATUS.ACTIVE,
  };
  const tenant = {
    requireActiveOrganizationId: () => binding.organizationId,
  } as unknown as TenantIsolationService;
  const bindings = {
    read: async () => binding,
  } as unknown as OrganizationOdooBindingReader;
  return new OdooReadService(new OdooJsonClient(config), tenant, bindings);
}

describeLive('odoo-rpc 活体链（真 Odoo·demo 实例）', () => {
  it('客户列表：demo bake 数据在场（total>0·视图字段齐）', async () => {
    const res = await liveService().listPartners(10);
    expect(res.total).toBeGreaterThan(0);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0]).toMatchObject({ name: expect.any(String) });
  });

  it('商品列表：sale_ok 模板可读·listPrice 为数值', async () => {
    const res = await liveService().listProducts(10);
    expect(res.total).toBeGreaterThan(0);
    for (const item of res.items) {
      expect(typeof item.name).toBe('string');
      expect(typeof item.listPrice).toBe('number');
    }
  });
});

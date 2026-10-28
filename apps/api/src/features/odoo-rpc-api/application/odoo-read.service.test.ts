import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import type {
  OrganizationOdooBindingReader,
  OrganizationOdooBindingRow,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { OdooJsonClient } from '../infrastructure/odoo-json.client';
import { OdooReadService } from './odoo-read.service';

/**
 * OdooReadService 单测：锁「白名单视图 + False 归一 + 上游模式漂移当场 502」，
 * 并锁切片 B 的 company 域强制注入与 fail-closed 泄露矩阵（domain 必含 `['company_id','=',cid]`
 * + `allowed_company_ids` 上下文；无绑定/非 ready/非 active/无活动租户一律 403）。
 * client / tenant / binding reader 均以 stub 注入（不触网、不触库）。
 */

const CID = 7;
const ORG_ID = 'org-1';

function readyBinding(
  overrides: Partial<OrganizationOdooBindingRow> = {},
): OrganizationOdooBindingRow {
  return {
    organizationId: ORG_ID,
    odooCompanyId: CID,
    odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.READY,
    odooCompanyName: 'Demo Company',
    odooBoundAt: new Date(),
    organizationStatus: TENANT_STATUS.ACTIVE,
    ...overrides,
  };
}

interface Stubs {
  searchRead: ReturnType<typeof vi.fn>;
  searchCount: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
}

function makeService(
  rows: unknown[],
  total = 99,
  binding: OrganizationOdooBindingRow | null = readyBinding(),
  opts: { organizationId?: string; activeOrg?: boolean } = {},
): { svc: OdooReadService; stubs: Stubs } {
  const searchRead = vi.fn().mockResolvedValue(rows);
  const searchCount = vi.fn().mockResolvedValue(total);
  const client = { searchRead, searchCount } as unknown as OdooJsonClient;

  const organizationId = opts.organizationId ?? ORG_ID;
  const tenant = {
    requireActiveOrganizationId: vi.fn(() => {
      if (opts.activeOrg === false) throw new ForbiddenException('无活动租户');
      return organizationId;
    }),
  } as unknown as TenantIsolationService;

  const read = vi.fn().mockResolvedValue(binding);
  const bindings = { read } as unknown as OrganizationOdooBindingReader;

  const svc = new OdooReadService(client, tenant, bindings);
  return { svc, stubs: { searchRead, searchCount, read } };
}

describe('OdooReadService（只读白名单用例 · 切片 B company 域注入）', () => {
  it('listPartners：字段白名单视图 + email False→null + total/limit 信封', async () => {
    const { svc } = makeService([
      { id: 10, name: 'Acme Corporation', email: 'info@agrolait.com' },
      { id: 16, name: 'Azure Interior', email: false },
    ]);
    await expect(svc.listPartners(20)).resolves.toEqual({
      items: [
        { id: 10, name: 'Acme Corporation', email: 'info@agrolait.com' },
        { id: 16, name: 'Azure Interior', email: null },
      ],
      total: 99,
      limit: 20,
    });
  });

  it('listPartners：domain 统一注入公司域 term + allowed_company_ids 上下文（不可绕过）', async () => {
    const { svc, stubs } = makeService([{ id: 1, name: 'X', email: false }]);
    await svc.listPartners(20);
    const [model, domain, _fields, _limit, context] = stubs.searchRead.mock.calls[0] as [
      string,
      unknown[],
      string[],
      number,
      Record<string, unknown>,
    ];
    expect(model).toBe('res.partner');
    expect(domain).toContainEqual(['company_id', '=', CID]);
    expect(domain).toContainEqual(['customer_rank', '>', 0]);
    expect(context).toEqual({ allowed_company_ids: [CID] });
    // search_count 同域同上下文（读面口径一致·不得只收窄 search_read）
    const [, countDomain, countContext] = stubs.searchCount.mock.calls[0] as [
      string,
      unknown[],
      Record<string, unknown>,
    ];
    expect(countDomain).toContainEqual(['company_id', '=', CID]);
    expect(countContext).toEqual({ allowed_company_ids: [CID] });
  });

  it('listProducts：注入公司域 + list_price 缺失值 False→0 归一', async () => {
    const { svc, stubs } = makeService([
      { id: 1, name: 'Product A', list_price: 49.99 },
      { id: 2, name: 'Product B', list_price: false },
    ]);
    const res = await svc.listProducts(5);
    expect(res.items).toEqual([
      { id: 1, name: 'Product A', listPrice: 49.99 },
      { id: 2, name: 'Product B', listPrice: 0 },
    ]);
    expect(res.limit).toBe(5);
    const [, domain] = stubs.searchRead.mock.calls[0] as [string, unknown[]];
    expect(domain).toContainEqual(['company_id', '=', CID]);
    expect(domain).toContainEqual(['sale_ok', '=', true]);
  });

  it('上游字段类型漂移（name 非文本）→ 当场 502，不静默透传', async () => {
    const { svc } = makeService([{ id: 1, name: false }]);
    await expect(svc.listPartners(20)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('视图 schema 拒绝多余字段泄漏（白名单外字段被 parse 剥除）', async () => {
    const { svc } = makeService([{ id: 1, name: 'X', email: 'e@x', phone_secret: 'LEAK' }]);
    const res = await svc.listPartners(20);
    expect(res.items[0]).not.toHaveProperty('phone_secret');
  });

  // —— 泄露矩阵（fail-closed·切片 B §2.2/§2.5）——
  it('无绑定（read→null）→ 403，绝不落 RPC 调用', async () => {
    const { svc, stubs } = makeService([], 0, null);
    await expect(svc.listPartners(20)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stubs.searchRead).not.toHaveBeenCalled();
  });

  it('绑定非 ready（pending）→ 403，不落 RPC', async () => {
    const { svc, stubs } = makeService(
      [],
      0,
      readyBinding({ odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.PENDING }),
    );
    await expect(svc.listProducts(20)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stubs.searchRead).not.toHaveBeenCalled();
  });

  it('租户非 active（suspended 携 ready 绑定）→ 403（治理态透传 canUseOdoo·防字段错位漏检）', async () => {
    const { svc, stubs } = makeService(
      [],
      0,
      readyBinding({ organizationStatus: TENANT_STATUS.SUSPENDED }),
    );
    await expect(svc.listPartners(20)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stubs.searchRead).not.toHaveBeenCalled();
  });

  it('无活动租户上下文 → 403，绑定读取根本不触发', async () => {
    const { svc, stubs } = makeService([], 0, readyBinding(), { activeOrg: false });
    await expect(svc.listPartners(20)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stubs.read).not.toHaveBeenCalled();
  });
});

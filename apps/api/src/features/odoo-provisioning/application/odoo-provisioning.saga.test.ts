import { OrganizationStatusTransitionedEvent } from '@core/saas-kit/modules/organizations/lifecycle/events/organization-status-transitioned.event';
import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import type {
  OrganizationOdooBindingReader,
  OrganizationOdooBindingRow,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import type { OrganizationOdooBindingWriter } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-writer';
import { describe, expect, it, vi } from 'vitest';
import type { OdooCompanyGateway } from '../infrastructure/odoo-company-gateway';
import { expectedCompanyName, OdooProvisioningSaga } from './odoo-provisioning.saga';

/**
 * 开通 saga 编排单测（module-org-odoo-company-mapping 切片 C·feature 侧·stub 注入不触网不触库）。
 *
 * 锁 saga 的**编排逻辑半**（与 organizations 上下文 `organization-odoo-binding-writer.e2e.test.ts` 的
 * 「库级状态机半」合起来即切片 C 全链）：首次开通触发时机、先落意图、命名回找幂等、失败置 failed、
 * 不把半成品误标 ready。库读写由 published port e2e 锁，本测只验 saga 对端口/网关的调用时序与门判。
 */

const ORG_ID = 'org-new';
const COMPANY_ID = 42;

function bindingRow(
  overrides: Partial<OrganizationOdooBindingRow> = {},
): OrganizationOdooBindingRow {
  return {
    organizationId: ORG_ID,
    odooCompanyId: null,
    odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.PENDING,
    odooCompanyName: null,
    odooBoundAt: null,
    organizationStatus: TENANT_STATUS.ACTIVE,
    ...overrides,
  };
}

function approveEvent(
  from: TenantStatus = TENANT_STATUS.PENDING,
): OrganizationStatusTransitionedEvent {
  return new OrganizationStatusTransitionedEvent({
    aggregateId: ORG_ID,
    payload: { from, to: TENANT_STATUS.ACTIVE },
  });
}

interface Spies {
  read: ReturnType<typeof vi.fn>;
  beginProvisioning: ReturnType<typeof vi.fn>;
  markReady: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
  findCompanyIdByName: ReturnType<typeof vi.fn>;
  createCompany: ReturnType<typeof vi.fn>;
  applyLocalizationBaseline: ReturnType<typeof vi.fn>;
  provisionAdministrator: ReturnType<typeof vi.fn>;
}

function makeSaga(
  binding: OrganizationOdooBindingRow | null = bindingRow(),
  gatewayOverride: Partial<Pick<Spies, 'findCompanyIdByName' | 'createCompany'>> = {},
): { saga: OdooProvisioningSaga; s: Spies } {
  const read = vi.fn().mockResolvedValue(binding);
  const beginProvisioning = vi.fn().mockResolvedValue(undefined);
  const markReady = vi.fn().mockResolvedValue(undefined);
  const markFailed = vi.fn().mockResolvedValue(undefined);
  const findCompanyIdByName =
    gatewayOverride.findCompanyIdByName ?? vi.fn().mockResolvedValue(null);
  const createCompany = gatewayOverride.createCompany ?? vi.fn().mockResolvedValue(COMPANY_ID);
  const applyLocalizationBaseline = vi.fn().mockResolvedValue(undefined);
  const provisionAdministrator = vi.fn().mockResolvedValue(undefined);

  const bindings = { read } as unknown as OrganizationOdooBindingReader;
  const writer = {
    beginProvisioning,
    markReady,
    markFailed,
  } as unknown as OrganizationOdooBindingWriter;
  const gateway = {
    findCompanyIdByName,
    createCompany,
    applyLocalizationBaseline,
    provisionAdministrator,
  } as unknown as OdooCompanyGateway;

  return {
    saga: new OdooProvisioningSaga(bindings, writer, gateway),
    s: {
      read,
      beginProvisioning,
      markReady,
      markFailed,
      findCompanyIdByName,
      createCompany,
      applyLocalizationBaseline,
      provisionAdministrator,
    },
  };
}

describe('OdooProvisioningSaga 编排', () => {
  it('①非首次开通（resume suspended→active）→ 零动作（不读绑定、不写状态、不碰网关）', async () => {
    const { saga, s } = makeSaga();
    await saga.handle(approveEvent(TENANT_STATUS.SUSPENDED));
    expect(s.read).not.toHaveBeenCalled();
    expect(s.beginProvisioning).not.toHaveBeenCalled();
    expect(s.createCompany).not.toHaveBeenCalled();
    expect(s.markReady).not.toHaveBeenCalled();
  });

  it('②幂等重提 active→active → 零动作', async () => {
    const { saga, s } = makeSaga();
    await saga.handle(approveEvent(TENANT_STATUS.ACTIVE));
    expect(s.beginProvisioning).not.toHaveBeenCalled();
  });

  it('③绑定已 ready → 早退（先落意图/建司均不发生·防重投重复建司）', async () => {
    const { saga, s } = makeSaga(
      bindingRow({
        odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.READY,
        odooCompanyId: COMPANY_ID,
      }),
    );
    await saga.handle(approveEvent());
    expect(s.read).toHaveBeenCalledWith(ORG_ID);
    expect(s.beginProvisioning).not.toHaveBeenCalled();
    expect(s.findCompanyIdByName).not.toHaveBeenCalled();
    expect(s.markReady).not.toHaveBeenCalled();
  });

  it('④租户消失（read→null）→ 无从开通·不写状态', async () => {
    const { saga, s } = makeSaga(null);
    await saga.handle(approveEvent());
    expect(s.beginProvisioning).not.toHaveBeenCalled();
    expect(s.markReady).not.toHaveBeenCalled();
  });

  it('⑤happy：先落意图→回找未命中→建司→本地化→预配→回写 ready（携确定性名 + 公司 id）', async () => {
    const { saga, s } = makeSaga();
    await saga.handle(approveEvent());
    expect(s.beginProvisioning).toHaveBeenCalledWith(ORG_ID);
    expect(s.findCompanyIdByName).toHaveBeenCalledWith(expectedCompanyName(ORG_ID));
    expect(s.createCompany).toHaveBeenCalledWith(expectedCompanyName(ORG_ID));
    expect(s.applyLocalizationBaseline).toHaveBeenCalledWith(COMPANY_ID);
    expect(s.provisionAdministrator).toHaveBeenCalledWith(COMPANY_ID);
    expect(s.markReady).toHaveBeenCalledWith(ORG_ID, {
      odooCompanyId: COMPANY_ID,
      odooCompanyName: expectedCompanyName(ORG_ID),
    });
    expect(s.markFailed).not.toHaveBeenCalled();
  });

  it('⑥命名回找命中 → 复用既有公司 id·绝不重复 createCompany（崩溃/重投幂等）', async () => {
    const { saga, s } = makeSaga(bindingRow(), {
      findCompanyIdByName: vi.fn().mockResolvedValue(COMPANY_ID),
    });
    await saga.handle(approveEvent());
    expect(s.createCompany).not.toHaveBeenCalled();
    expect(s.markReady).toHaveBeenCalledWith(ORG_ID, {
      odooCompanyId: COMPANY_ID,
      odooCompanyName: expectedCompanyName(ORG_ID),
    });
  });

  it('⑦建司抛错 → 置 failed（携原因）·绝不 markReady（不把半成品误标就绪·fail-closed）', async () => {
    const boom = new Error('res.company create 被拒：凭证无 write 权限');
    const { saga, s } = makeSaga(bindingRow(), {
      createCompany: vi.fn().mockRejectedValue(boom),
    });
    await saga.handle(approveEvent());
    expect(s.beginProvisioning).toHaveBeenCalledWith(ORG_ID);
    expect(s.markFailed).toHaveBeenCalledWith(ORG_ID, boom.message);
    expect(s.markReady).not.toHaveBeenCalled();
  });

  it('⑧本地化步抛错 → 置 failed·不 markReady（任一步失败皆归 failed）', async () => {
    const { saga, s } = makeSaga();
    s.applyLocalizationBaseline.mockRejectedValue(new Error('l10n 基线失败'));
    await saga.handle(approveEvent());
    expect(s.markFailed).toHaveBeenCalledWith(ORG_ID, 'l10n 基线失败');
    expect(s.markReady).not.toHaveBeenCalled();
    expect(s.provisionAdministrator).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { ORGANIZATION_STATUS } from './organization-lifecycle';
import {
  canUseOdoo,
  ORGANIZATION_ODOO_BINDING_STATUS,
  type OrganizationOdooBindingStatus,
} from './organization-odoo-binding';

/**
 * `canUseOdoo` 单源裁决矩阵（module-org-odoo-company-mapping 切片 A）：
 * 三点门禁（面板/SSO/RPC）共用的纯函数在此逐格锁死——fail-closed 是裁决本身，
 * 不是各消费点的自觉。
 */
describe('canUseOdoo · Odoo 可用性单源裁决', () => {
  const ready = {
    status: ORGANIZATION_STATUS.ACTIVE,
    odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.READY as OrganizationOdooBindingStatus,
    odooCompanyId: 7,
  };

  it('active ∧ ready ∧ 有公司 id → 放行（唯一真格）', () => {
    expect(canUseOdoo(ready)).toBe(true);
  });

  it('未绑定（binding 缺席/null）→ 拒——存量 org 即使 active 也不可用 Odoo', () => {
    expect(canUseOdoo({ status: ORGANIZATION_STATUS.ACTIVE })).toBe(false);
    expect(canUseOdoo({ ...ready, odooBindingStatus: null, odooCompanyId: null })).toBe(false);
  });

  it('中间态 pending/provisioning/failed → 拒', () => {
    for (const st of [
      ORGANIZATION_ODOO_BINDING_STATUS.PENDING,
      ORGANIZATION_ODOO_BINDING_STATUS.PROVISIONING,
      ORGANIZATION_ODOO_BINDING_STATUS.FAILED,
    ] as const) {
      expect(canUseOdoo({ ...ready, odooBindingStatus: st })).toBe(false);
    }
  });

  it('治理态非 active（pending_approval/suspended/deleted）→ 拒，即使绑定 ready', () => {
    for (const st of [
      ORGANIZATION_STATUS.PENDING,
      ORGANIZATION_STATUS.SUSPENDED,
      ORGANIZATION_STATUS.DELETED,
    ] as const) {
      expect(canUseOdoo({ ...ready, status: st })).toBe(false);
    }
  });

  it('治理态缺席视同 active（deny-list 同口径），但绑定仍须显式 ready', () => {
    expect(canUseOdoo({ odooBindingStatus: ready.odooBindingStatus, odooCompanyId: 7 })).toBe(true);
    expect(canUseOdoo({})).toBe(false);
  });

  it('绑定 ready 但公司 id 缺失（数据破损态）→ 拒（双条件不可互相代偿）', () => {
    expect(canUseOdoo({ ...ready, odooCompanyId: null })).toBe(false);
  });
});

import {
  canTransition,
  isTenancyBlocked,
  TENANCY_STATUS,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { describe, expect, it } from 'vitest';

/**
 * 租户态机纯函数测（global-tenant-entity-reclamation 切片 B 换轨后）。
 * 旧 `readOrganizationStatus`/`withOrganizationStatus`/`isTenantActive` metadata 解析形已随寄居退场——
 * 词汇改为 status 导向；非法值的入口防线不再靠容错解析，而由 `tenant.status` DB CHECK
 * 钉死（真库负向测见 `organization-table.e2e.test.ts`）。
 */
describe('organization-lifecycle (S4 · FR-1 状态机纯函数)', () => {
  describe('isTenancyBlocked (S4 deny-list·status 形)', () => {
    it('blocks explicit lifecycle-stop states', () => {
      for (const s of ['pending_approval', 'suspended', 'deleted'] as const) {
        expect(isTenancyBlocked(s)).toBe(true);
      }
    });

    it('does NOT block active or unrecorded status (back-compat · 存量/seeded 无户籍)', () => {
      expect(isTenancyBlocked(TENANCY_STATUS.ACTIVE)).toBe(false);
      expect(isTenancyBlocked(undefined)).toBe(false);
    });
  });

  describe('canTransition (S5 · §9.4 迁移表)', () => {
    it('permits the sanctioned edges', () => {
      expect(canTransition(TENANCY_STATUS.PENDING, TENANCY_STATUS.ACTIVE)).toBe(true);
      expect(canTransition(TENANCY_STATUS.PENDING, TENANCY_STATUS.DELETED)).toBe(true);
      expect(canTransition(TENANCY_STATUS.ACTIVE, TENANCY_STATUS.SUSPENDED)).toBe(true);
      expect(canTransition(TENANCY_STATUS.ACTIVE, TENANCY_STATUS.DELETED)).toBe(true);
      expect(canTransition(TENANCY_STATUS.ACTIVE, TENANCY_STATUS.ACTIVE)).toBe(true); // 幂等重提
      expect(canTransition(TENANCY_STATUS.SUSPENDED, TENANCY_STATUS.ACTIVE)).toBe(true);
      expect(canTransition(TENANCY_STATUS.SUSPENDED, TENANCY_STATUS.DELETED)).toBe(true);
    });

    it('treats an unrecorded status as active', () => {
      expect(canTransition(undefined, TENANCY_STATUS.SUSPENDED)).toBe(true);
      expect(canTransition(undefined, TENANCY_STATUS.PENDING)).toBe(false);
    });

    it('rejects illegal edges and the deleted terminal state', () => {
      expect(canTransition(TENANCY_STATUS.ACTIVE, TENANCY_STATUS.PENDING)).toBe(false);
      expect(canTransition(TENANCY_STATUS.SUSPENDED, TENANCY_STATUS.PENDING)).toBe(false);
      expect(canTransition(TENANCY_STATUS.DELETED, TENANCY_STATUS.ACTIVE)).toBe(false);
      expect(canTransition(TENANCY_STATUS.DELETED, TENANCY_STATUS.DELETED)).toBe(false);
    });
  });
});

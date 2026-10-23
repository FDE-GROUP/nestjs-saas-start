import {
  canTransition,
  isOrganizationBlocked,
  ORGANIZATION_STATUS,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { describe, expect, it } from 'vitest';

/**
 * 租户态机纯函数测（global-tenant-entity-reclamation 切片 B 换轨后）。
 * 旧 `readOrganizationStatus`/`withOrganizationStatus`/`isTenantActive` metadata 解析形已随寄居退场——
 * 词汇改为 status 导向；非法值的入口防线不再靠容错解析，而由 `tenant.status` DB CHECK
 * 钉死（真库负向测见 `tenant-table.e2e.test.ts`）。
 */
describe('organization-lifecycle (S4 · FR-1 状态机纯函数)', () => {
  describe('isOrganizationBlocked (S4 deny-list·status 形)', () => {
    it('blocks explicit lifecycle-stop states', () => {
      for (const s of ['pending_approval', 'suspended', 'deleted'] as const) {
        expect(isOrganizationBlocked(s)).toBe(true);
      }
    });

    it('does NOT block active or unrecorded status (back-compat · 存量/seeded 无户籍)', () => {
      expect(isOrganizationBlocked(ORGANIZATION_STATUS.ACTIVE)).toBe(false);
      expect(isOrganizationBlocked(undefined)).toBe(false);
    });
  });

  describe('canTransition (S5 · §9.4 迁移表)', () => {
    it('permits the sanctioned edges', () => {
      expect(canTransition(ORGANIZATION_STATUS.PENDING, ORGANIZATION_STATUS.ACTIVE)).toBe(true);
      expect(canTransition(ORGANIZATION_STATUS.PENDING, ORGANIZATION_STATUS.DELETED)).toBe(true);
      expect(canTransition(ORGANIZATION_STATUS.ACTIVE, ORGANIZATION_STATUS.SUSPENDED)).toBe(true);
      expect(canTransition(ORGANIZATION_STATUS.ACTIVE, ORGANIZATION_STATUS.DELETED)).toBe(true);
      expect(canTransition(ORGANIZATION_STATUS.ACTIVE, ORGANIZATION_STATUS.ACTIVE)).toBe(true); // 幂等重提
      expect(canTransition(ORGANIZATION_STATUS.SUSPENDED, ORGANIZATION_STATUS.ACTIVE)).toBe(true);
      expect(canTransition(ORGANIZATION_STATUS.SUSPENDED, ORGANIZATION_STATUS.DELETED)).toBe(true);
    });

    it('treats an unrecorded status as active', () => {
      expect(canTransition(undefined, ORGANIZATION_STATUS.SUSPENDED)).toBe(true);
      expect(canTransition(undefined, ORGANIZATION_STATUS.PENDING)).toBe(false);
    });

    it('rejects illegal edges and the deleted terminal state', () => {
      expect(canTransition(ORGANIZATION_STATUS.ACTIVE, ORGANIZATION_STATUS.PENDING)).toBe(false);
      expect(canTransition(ORGANIZATION_STATUS.SUSPENDED, ORGANIZATION_STATUS.PENDING)).toBe(false);
      expect(canTransition(ORGANIZATION_STATUS.DELETED, ORGANIZATION_STATUS.ACTIVE)).toBe(false);
      expect(canTransition(ORGANIZATION_STATUS.DELETED, ORGANIZATION_STATUS.DELETED)).toBe(false);
    });
  });
});

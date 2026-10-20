import {
  canTransition,
  isTenantBlocked,
  TENANT_STATUS,
} from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { describe, expect, it } from 'vitest';

/**
 * 租户态机纯函数测（global-tenant-entity-reclamation 切片 B 换轨后）。
 * 旧 `readTenantStatus`/`withTenantStatus`/`isTenantActive` metadata 解析形已随寄居退场——
 * 词汇改为 status 导向；非法值的入口防线不再靠容错解析，而由 `tenant.status` DB CHECK
 * 钉死（真库负向测见 `tenant-table.e2e.test.ts`）。
 */
describe('tenant-lifecycle (S4 · FR-1 状态机纯函数)', () => {
  describe('isTenantBlocked (S4 deny-list·status 形)', () => {
    it('blocks explicit lifecycle-stop states', () => {
      for (const s of ['pending_approval', 'suspended', 'deleted'] as const) {
        expect(isTenantBlocked(s)).toBe(true);
      }
    });

    it('does NOT block active or unrecorded status (back-compat · 存量/seeded 无户籍)', () => {
      expect(isTenantBlocked(TENANT_STATUS.ACTIVE)).toBe(false);
      expect(isTenantBlocked(undefined)).toBe(false);
    });
  });

  describe('canTransition (S5 · §9.4 迁移表)', () => {
    it('permits the sanctioned edges', () => {
      expect(canTransition(TENANT_STATUS.PENDING, TENANT_STATUS.ACTIVE)).toBe(true);
      expect(canTransition(TENANT_STATUS.PENDING, TENANT_STATUS.DELETED)).toBe(true);
      expect(canTransition(TENANT_STATUS.ACTIVE, TENANT_STATUS.SUSPENDED)).toBe(true);
      expect(canTransition(TENANT_STATUS.ACTIVE, TENANT_STATUS.DELETED)).toBe(true);
      expect(canTransition(TENANT_STATUS.ACTIVE, TENANT_STATUS.ACTIVE)).toBe(true); // 幂等重提
      expect(canTransition(TENANT_STATUS.SUSPENDED, TENANT_STATUS.ACTIVE)).toBe(true);
      expect(canTransition(TENANT_STATUS.SUSPENDED, TENANT_STATUS.DELETED)).toBe(true);
    });

    it('treats an unrecorded status as active', () => {
      expect(canTransition(undefined, TENANT_STATUS.SUSPENDED)).toBe(true);
      expect(canTransition(undefined, TENANT_STATUS.PENDING)).toBe(false);
    });

    it('rejects illegal edges and the deleted terminal state', () => {
      expect(canTransition(TENANT_STATUS.ACTIVE, TENANT_STATUS.PENDING)).toBe(false);
      expect(canTransition(TENANT_STATUS.SUSPENDED, TENANT_STATUS.PENDING)).toBe(false);
      expect(canTransition(TENANT_STATUS.DELETED, TENANT_STATUS.ACTIVE)).toBe(false);
      expect(canTransition(TENANT_STATUS.DELETED, TENANT_STATUS.DELETED)).toBe(false);
    });
  });
});

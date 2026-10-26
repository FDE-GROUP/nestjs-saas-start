import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import type { AuditLogEntry } from '@core/saas-kit/shared-kernel/audit/audit-log.store';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformAuditService (S5 · FR-6 治理审计单点 · 切片 E 双通道)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let appended: AuditLogEntry[];
  const store = { append: (e: AuditLogEntry) => Promise.resolve(void appended.push(e)) };
  const svc = new PlatformAuditService(store);

  beforeEach(() => {
    appended = [];
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('已提交动作：pino 结构化载荷 + audit_log 落账（entityType=tenant）', async () => {
    await svc.logOrganizationGovernance('approve', 'orgA', 'op1', {
      from: TENANCY_STATUS.PENDING,
      to: TENANCY_STATUS.ACTIVE,
    });
    const payload = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      audit: 'platform.tenant',
      action: 'approve',
      organizationId: 'orgA',
      operatorId: 'op1',
      from: TENANCY_STATUS.PENDING,
      to: TENANCY_STATUS.ACTIVE,
    });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      entityType: 'tenant',
      entityId: 'orgA',
      action: 'approve',
      from: TENANCY_STATUS.PENDING,
      to: TENANCY_STATUS.ACTIVE,
      actorId: 'op1',
    });
  });

  it('用户治理动作：落账 entityType=user（S6）', async () => {
    await svc.logUserGovernance('suspend', 'u1', 'op1', {
      from: TENANCY_STATUS.ACTIVE,
      to: TENANCY_STATUS.SUSPENDED,
      reason: 'abuse',
    });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      entityType: 'user',
      entityId: 'u1',
      action: 'suspend',
      reason: 'abuse',
    });
  });

  it('失败尝试（携 error）：仅观测·不入耐久账本', async () => {
    await svc.logOrganizationGovernance('suspend', 'orgA', 'op1', {
      from: TENANCY_STATUS.PENDING,
      to: TENANCY_STATUS.SUSPENDED,
      error: 'illegal_transition',
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(appended).toHaveLength(0);
  });

  it('驳回/硬删无 to：from 落账、to 归 null', async () => {
    await svc.logOrganizationGovernance('hard_delete', 'orgC', 'op2', {
      from: TENANCY_STATUS.DELETED,
    });
    expect(appended[0]).toMatchObject({
      entityId: 'orgC',
      from: TENANCY_STATUS.DELETED,
      to: null,
    });
  });

  it('PII 最小化（负向）：账条目绝不含 email/姓名等个人数据字段', async () => {
    await svc.logUserGovernance('resume', 'u9', 'op1', {
      from: TENANCY_STATUS.SUSPENDED,
      to: TENANCY_STATUS.ACTIVE,
    });
    const entry = appended[0] as unknown as Record<string, unknown>;
    for (const forbidden of ['email', 'name', 'phone', 'password', 'user', 'operator']) {
      expect(Object.keys(entry), `账条目泄漏 PII 键：${forbidden}`).not.toContain(forbidden);
    }
    // 只允许裸 id（entityId/actorId）承载身份，不承载任何可识别个人数据。
    expect(entry.entityId).toBe('u9');
    expect(entry.actorId).toBe('op1');
  });
});

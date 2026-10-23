import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApproveTenantCommand } from '../approve-tenant.command';
import { ApproveTenantCommandHandler } from './approve-tenant.command-handler';

function makeHandler(transition: ReturnType<typeof vi.fn>) {
  const audit = { logTenantGovernance: vi.fn() };
  const handler = new ApproveTenantCommandHandler(
    { transition } as unknown as OrganizationStatusService,
    audit as unknown as PlatformAuditService,
  );
  return { handler, audit };
}

describe('ApproveTenantCommandHandler (S4/S5 · FR-1 严格迁移 · FR-6 审计)', () => {
  it('transitions pending → active, returns the receipt and audits', async () => {
    const transition = vi.fn().mockResolvedValue({
      kind: 'ok',
      previous: ORGANIZATION_STATUS.PENDING,
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    const { handler, audit } = makeHandler(transition);
    await expect(handler.execute(new ApproveTenantCommand('org-1', 'op-1'))).resolves.toEqual({
      organizationId: 'org-1',
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(transition).toHaveBeenCalledWith('org-1', ORGANIZATION_STATUS.ACTIVE, {
      actorId: 'op-1',
    });
    expect(audit.logTenantGovernance).toHaveBeenCalledWith('approve', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.PENDING,
      to: ORGANIZATION_STATUS.ACTIVE,
    });
  });

  it('returns null when the tenant does not exist (controller → 404) without audit', async () => {
    const transition = vi.fn().mockResolvedValue({ kind: 'not-found' });
    const { handler, audit } = makeHandler(transition);
    await expect(handler.execute(new ApproveTenantCommand('ghost', 'op-1'))).resolves.toBeNull();
    expect(audit.logTenantGovernance).not.toHaveBeenCalled();
  });

  it('throws 409 on an illegal transition (e.g. already deleted) and audits the rejection', async () => {
    const transition = vi.fn().mockResolvedValue({
      kind: 'illegal',
      from: ORGANIZATION_STATUS.DELETED,
      to: ORGANIZATION_STATUS.ACTIVE,
    });
    const { handler, audit } = makeHandler(transition);
    await expect(handler.execute(new ApproveTenantCommand('org-1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(audit.logTenantGovernance).toHaveBeenCalledWith('approve', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.DELETED,
      to: ORGANIZATION_STATUS.ACTIVE,
      error: 'illegal_transition',
    });
  });
});

import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApproveOrganizationCommand } from '../approve-organization.command';
import { ApproveOrganizationCommandHandler } from './approve-organization.command-handler';

function makeHandler(transition: ReturnType<typeof vi.fn>) {
  const audit = { logOrganizationGovernance: vi.fn() };
  const handler = new ApproveOrganizationCommandHandler(
    { transition } as unknown as TenantStatusService,
    audit as unknown as PlatformAuditService,
  );
  return { handler, audit };
}

describe('ApproveOrganizationCommandHandler (S4/S5 · FR-1 严格迁移 · FR-6 审计)', () => {
  it('transitions pending → active, returns the receipt and audits', async () => {
    const transition = vi.fn().mockResolvedValue({
      kind: 'ok',
      previous: TENANCY_STATUS.PENDING,
      status: TENANCY_STATUS.ACTIVE,
    });
    const { handler, audit } = makeHandler(transition);
    await expect(handler.execute(new ApproveOrganizationCommand('org-1', 'op-1'))).resolves.toEqual(
      {
        organizationId: 'org-1',
        status: TENANCY_STATUS.ACTIVE,
      },
    );
    expect(transition).toHaveBeenCalledWith('org-1', TENANCY_STATUS.ACTIVE, {
      actorId: 'op-1',
    });
    expect(audit.logOrganizationGovernance).toHaveBeenCalledWith('approve', 'org-1', 'op-1', {
      from: TENANCY_STATUS.PENDING,
      to: TENANCY_STATUS.ACTIVE,
    });
  });

  it('returns null when the tenant does not exist (controller → 404) without audit', async () => {
    const transition = vi.fn().mockResolvedValue({ kind: 'not-found' });
    const { handler, audit } = makeHandler(transition);
    await expect(
      handler.execute(new ApproveOrganizationCommand('ghost', 'op-1')),
    ).resolves.toBeNull();
    expect(audit.logOrganizationGovernance).not.toHaveBeenCalled();
  });

  it('throws 409 on an illegal transition (e.g. already deleted) and audits the rejection', async () => {
    const transition = vi.fn().mockResolvedValue({
      kind: 'illegal',
      from: TENANCY_STATUS.DELETED,
      to: TENANCY_STATUS.ACTIVE,
    });
    const { handler, audit } = makeHandler(transition);
    await expect(
      handler.execute(new ApproveOrganizationCommand('org-1', 'op-1')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.logOrganizationGovernance).toHaveBeenCalledWith('approve', 'org-1', 'op-1', {
      from: TENANCY_STATUS.DELETED,
      to: TENANCY_STATUS.ACTIVE,
      error: 'illegal_transition',
    });
  });
});

import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DeleteTenantCommand } from '../delete-tenant.command';
import { ResumeTenantCommand } from '../resume-tenant.command';
import { SuspendTenantCommand } from '../suspend-tenant.command';
import { DeleteTenantCommandHandler } from './delete-tenant.command-handler';
import { ResumeTenantCommandHandler } from './resume-tenant.command-handler';
import { SuspendTenantCommandHandler } from './suspend-tenant.command-handler';

function deps(result: unknown) {
  const transition = vi.fn().mockResolvedValue(result);
  const audit = { logTenantGovernance: vi.fn() };
  return {
    transition,
    status: { transition } as unknown as OrganizationStatusService,
    audit: audit as unknown as PlatformAuditService,
    auditSpy: audit.logTenantGovernance,
  };
}

describe('SuspendTenantCommandHandler (S5 · FR-6/FR-10)', () => {
  it('transitions to suspended and audits', async () => {
    const d = deps({
      kind: 'ok',
      previous: ORGANIZATION_STATUS.ACTIVE,
      status: ORGANIZATION_STATUS.SUSPENDED,
    });
    const handler = new SuspendTenantCommandHandler(d.status, d.audit);
    await expect(handler.execute(new SuspendTenantCommand('org-1', 'op-1'))).resolves.toEqual({
      organizationId: 'org-1',
      status: ORGANIZATION_STATUS.SUSPENDED,
    });
    expect(d.transition).toHaveBeenCalledWith('org-1', ORGANIZATION_STATUS.SUSPENDED, {
      actorId: 'op-1',
    });
    expect(d.auditSpy).toHaveBeenCalledWith('suspend', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.ACTIVE,
      to: ORGANIZATION_STATUS.SUSPENDED,
    });
  });

  it('404s on not-found without auditing', async () => {
    const d = deps({ kind: 'not-found' });
    const handler = new SuspendTenantCommandHandler(d.status, d.audit);
    await expect(handler.execute(new SuspendTenantCommand('ghost', 'op-1'))).resolves.toBeNull();
    expect(d.auditSpy).not.toHaveBeenCalled();
  });

  it('409s and audits an illegal transition', async () => {
    const d = deps({
      kind: 'illegal',
      from: ORGANIZATION_STATUS.PENDING,
      to: ORGANIZATION_STATUS.SUSPENDED,
    });
    const handler = new SuspendTenantCommandHandler(d.status, d.audit);
    await expect(handler.execute(new SuspendTenantCommand('org-1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.auditSpy).toHaveBeenCalledWith('suspend', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.PENDING,
      to: ORGANIZATION_STATUS.SUSPENDED,
      error: 'illegal_transition',
    });
  });
});

describe('ResumeTenantCommandHandler (S5 · FR-6)', () => {
  it('transitions suspended → active and audits', async () => {
    const d = deps({
      kind: 'ok',
      previous: ORGANIZATION_STATUS.SUSPENDED,
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    const handler = new ResumeTenantCommandHandler(d.status, d.audit);
    await expect(handler.execute(new ResumeTenantCommand('org-1', 'op-1'))).resolves.toEqual({
      organizationId: 'org-1',
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    expect(d.transition).toHaveBeenCalledWith('org-1', ORGANIZATION_STATUS.ACTIVE, {
      actorId: 'op-1',
    });
    expect(d.auditSpy).toHaveBeenCalledWith('resume', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.SUSPENDED,
      to: ORGANIZATION_STATUS.ACTIVE,
    });
  });
});

describe('DeleteTenantCommandHandler (S5 · FR-6/NFR-6 软删)', () => {
  it('transitions to deleted terminal and audits', async () => {
    const d = deps({
      kind: 'ok',
      previous: ORGANIZATION_STATUS.ACTIVE,
      status: ORGANIZATION_STATUS.DELETED,
    });
    const handler = new DeleteTenantCommandHandler(d.status, d.audit);
    await expect(handler.execute(new DeleteTenantCommand('org-1', 'op-1'))).resolves.toEqual({
      organizationId: 'org-1',
      status: ORGANIZATION_STATUS.DELETED,
    });
    expect(d.transition).toHaveBeenCalledWith('org-1', ORGANIZATION_STATUS.DELETED, {
      actorId: 'op-1',
      reason: 'platform_delete',
    });
    expect(d.auditSpy).toHaveBeenCalledWith('delete', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.ACTIVE,
      to: ORGANIZATION_STATUS.DELETED,
    });
  });

  it('409s when re-deleting an already-deleted tenant', async () => {
    const d = deps({
      kind: 'illegal',
      from: ORGANIZATION_STATUS.DELETED,
      to: ORGANIZATION_STATUS.DELETED,
    });
    const handler = new DeleteTenantCommandHandler(d.status, d.audit);
    await expect(handler.execute(new DeleteTenantCommand('org-1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

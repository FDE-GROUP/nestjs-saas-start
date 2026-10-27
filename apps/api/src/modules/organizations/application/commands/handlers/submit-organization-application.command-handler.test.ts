import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizationProvisioningRepository } from '../../../domain/repositories/organization-provisioning.repository';
import { SubmitOrganizationApplicationCommand } from '../submit-organization-application.command';
import { SubmitOrganizationApplicationCommandHandler } from './submit-organization-application.command-handler';

describe('SubmitOrganizationApplicationCommandHandler (S4 · FR-1)', () => {
  it('routes to the provisioning gateway and projects the receipt', async () => {
    const submit = vi
      .fn()
      .mockResolvedValue({ organizationId: 'org-9', status: TENANT_STATUS.PENDING });
    const handler = new SubmitOrganizationApplicationCommandHandler({
      submit,
    } as unknown as OrganizationProvisioningRepository);

    await expect(
      handler.execute(new SubmitOrganizationApplicationCommand('u1', 'Acme', 'acme')),
    ).resolves.toEqual({
      organizationId: 'org-9',
      status: TENANT_STATUS.PENDING,
    });
    expect(submit).toHaveBeenCalledWith('u1', 'Acme', 'acme');
  });
});

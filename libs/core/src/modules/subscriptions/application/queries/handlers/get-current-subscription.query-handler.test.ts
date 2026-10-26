import type {
  QuotaService,
  SeatQuotaSnapshot,
} from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetSubscriptionQueryHandler } from './get-current-subscription.query-handler';

const VIEW: SeatQuotaSnapshot = {
  hasSubscription: false,
  plan: 'free',
  seatsLimit: 5,
  used: 0,
  remaining: 5,
  providerCustomerId: null,
};

describe('GetSubscriptionQueryHandler (S7 · FR-7/FR-8 读侧单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assembles the snapshot for the ALS-resolved tenant', async () => {
    const snapshot = vi.fn().mockResolvedValue(VIEW);
    const quota = { snapshot } as unknown as QuotaService;
    const tenant = {
      requireActiveTenantId: () => 'tenantA',
    } as unknown as TenantIsolationService;
    const handler = new GetSubscriptionQueryHandler(quota, tenant);

    const result = await handler.execute({} as never);
    expect(snapshot).toHaveBeenCalledWith('tenantA');
    expect(result).toBe(VIEW);
  });
});

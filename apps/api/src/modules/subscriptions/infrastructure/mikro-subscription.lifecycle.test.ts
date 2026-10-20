import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroSubscriptionLifecycle } from './mikro-subscription.lifecycle';

/**
 * `MikroSubscriptionLifecycle` 单测（治理档 S2）：终态收敛的 SQL 面语义走 mock em——
 * 有 `from` 行只更新最新一条、无 `from` 行零写返 `false`（幂等的物理支点后半；真库往返由
 * env-gated e2e 承担·S3）。
 */

function makeLifecycle(rows: Array<{ id: string }>) {
  const nativeUpdate = vi.fn(async () => ({ affectedRows: 1 }));
  const find = vi.fn(async () => rows);
  const em = { find, nativeUpdate };
  const mikro = { fork: async () => em };
  const lifecycle = new MikroSubscriptionLifecycle(mikro as unknown as MikroOrmService);
  return { lifecycle, find, nativeUpdate };
}

describe('MikroSubscriptionLifecycle（系统面·终态收敛）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('存在 from 态行：只收敛最新一条（limit 1·显式 tenantId+status 谓词·盖 updatedAt）', async () => {
    const { lifecycle, find, nativeUpdate } = makeLifecycle([{ id: 'sub-1' }]);
    const changed = await lifecycle.convergeStatus(
      'org-9',
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
    expect(changed).toBe(true);
    expect(find).toHaveBeenCalledWith(
      TenantSubscription,
      { tenantId: 'org-9', status: SUBSCRIPTION_STATUS.ACTIVE },
      expect.objectContaining({ limit: 1 }),
    );
    expect(nativeUpdate).toHaveBeenCalledWith(
      TenantSubscription,
      { id: 'sub-1' },
      expect.objectContaining({
        status: SUBSCRIPTION_STATUS.SUSPENDED,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('无 from 行（重投/乱序滞后）：零写返 false——幂等 no-op 的物理兑现', async () => {
    const { lifecycle, nativeUpdate } = makeLifecycle([]);
    const changed = await lifecycle.convergeStatus(
      'org-9',
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
    expect(changed).toBe(false);
    expect(nativeUpdate).not.toHaveBeenCalled();
  });
});

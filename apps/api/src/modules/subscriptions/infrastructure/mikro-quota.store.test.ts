import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantMembership } from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroQuotaStore } from './mikro-quota.store';

/**
 * `QuotaStore` MikroORM 适配测（X7 R2 席位换锚·global-role-membership-tenantization 切片 D）：
 * 锁「席位用量读自有租级成员 SSOT `tenant_membership` live count」的接线——这是闭合新轴席位超卖
 * （R2 计费 fail-open）的核心读点。`tenant_membership` 不入全局 filter 集，故必 `scoped:false` 绕环境
 * ALS 筛 + 显式 `where{tenantId}` 锚界（跨租计量面免误筛）。fake em 只暴露 `count`。
 */
function makeStore(countImpl?: (entity: unknown, where: unknown) => Promise<number>) {
  const count = vi.fn(
    countImpl ??
      (() => {
        throw new Error('count not stubbed');
      }),
  );
  const em = { count } as unknown as Record<string, unknown>;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return { store: new MikroQuotaStore(mikro), count, fork };
}

describe('MikroQuotaStore · countMembers 换锚 tenant_membership（R2）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('读物化列改锚 live count(tenant_membership)·显式 where{tenantId}', async () => {
    const { store, count } = makeStore(async () => 3);
    const used = await store.countMembers('t1');
    expect(used).toBe(3);
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith(TenantMembership, { tenantId: 't1' });
  });

  it('跨租计量必以 scoped:false 绕 ALS 活动租筛（否则误筛本租→少算→超卖·接线恒等防线）', async () => {
    const { store, fork } = makeStore(async () => 0);
    await store.countMembers('t1');
    expect(fork).toHaveBeenCalledWith({ scoped: false });
  });

  it('无租成员行 → live count 返 0（fail-safe·席位卡点自会据 seatsLimit 拒加席）', async () => {
    const { store } = makeStore(async () => 0);
    expect(await store.countMembers('ghost')).toBe(0);
  });
});

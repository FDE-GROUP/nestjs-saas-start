import type { ConfigService } from '@app/config/config.service';
import { Session } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MikroOrmService } from '../../../database/mikro/mikro-orm.service';
import { SessionReclaimService } from './session-reclaim.service';

/**
 * `SessionReclaimService` 单测（module-session-index-and-expiry-reclaim F2）：删除谓词/防重入/
 * 生命周期开关走 mock em；真库幂等往返（过期删净·未过期幸存）由 env-gated e2e 承担。
 */

function makeService(opts: { enabled?: boolean; intervalMs?: number; deleted?: number } = {}) {
  const deleteArgs: Array<{ entity: unknown; where: unknown }> = [];
  const em = {
    nativeDelete: vi.fn(async (entity: unknown, where: unknown) => {
      deleteArgs.push({ entity, where });
      return opts.deleted ?? 0;
    }),
  };
  const mikro = { fork: async () => em };
  const config = {
    getSessionReclaimConfig: () => ({
      enabled: opts.enabled ?? false,
      intervalMs: opts.intervalMs ?? 3_600_000,
    }),
  };
  const service = new SessionReclaimService(
    config as unknown as ConfigService,
    mikro as unknown as MikroOrmService,
  );
  return { service, em, deleteArgs };
}

describe('SessionReclaimService（F2 · 甲′：镜像 relay 零依赖周期回收）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('缺省 enabled=false ⇒ 不启 timer（DB-free 不变量：零触库零调度）', () => {
    const { service, em } = makeService({ enabled: false });
    service.onApplicationBootstrap();
    expect((service as unknown as { timer?: unknown }).timer).toBeUndefined();
    expect(em.nativeDelete).not.toHaveBeenCalled();
  });

  it('enabled=true ⇒ 启 timer 且 onModuleDestroy 摘停', () => {
    const { service } = makeService({ enabled: true, intervalMs: 3_600_000 });
    service.onApplicationBootstrap();
    expect((service as unknown as { timer?: unknown }).timer).toBeDefined();
    service.onModuleDestroy();
    expect((service as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('reclaimOnce 以 { expiresAt: { $lt: Date } } 谓词删 Session 表并返回删除数', async () => {
    const { service, deleteArgs } = makeService({ deleted: 3 });
    expect(await service.reclaimOnce()).toBe(3);
    expect(deleteArgs).toHaveLength(1);
    expect(deleteArgs[0].entity).toBe(Session);
    const where = deleteArgs[0].where as { expiresAt: { $lt: Date } };
    expect(where.expiresAt.$lt).toBeInstanceOf(Date);
  });

  it('防重入：上一拍未完时二次调用立即返回 0（timer 拍不叠加）', async () => {
    const { service } = makeService();
    // 手工置 ticking=true 模拟在途一拍
    (service as unknown as { ticking: boolean }).ticking = true;
    expect(await service.reclaimOnce()).toBe(0);
    (service as unknown as { ticking: boolean }).ticking = false;
    expect(await service.reclaimOnce()).toBe(0); // 释放后正常跑（mock 返 0）
  });

  it('nativeDelete 抛错 ⇒ finally 复位 ticking 且不吞异常（供上层 catch 记录）', async () => {
    const { service, em } = makeService();
    em.nativeDelete.mockRejectedValueOnce(new Error('db down'));
    await expect(service.reclaimOnce()).rejects.toThrow('db down');
    expect((service as unknown as { ticking: boolean }).ticking).toBe(false);
  });
});

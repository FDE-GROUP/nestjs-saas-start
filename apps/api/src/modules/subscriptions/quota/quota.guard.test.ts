import { QuotaGuard } from '@core/saas-kit/modules/subscriptions/quota/quota.guard';
import type { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { type ExecutionContext, ForbiddenException, HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Only getHandler/getClass are exercised by the guard (no request access). */
function ctx(): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function reflectorReturning(requirement: unknown) {
  return { getAllAndOverride: vi.fn(() => requirement) } as unknown as Reflector;
}

/** 架构精度修宪 S2：QuotaService 不再抛 HTTP（无 assertSeats）——桩 `checkSeats` 判别结果，402 由守卫翻译。 */
function quotaService(over = false) {
  return {
    checkSeats: vi.fn(async (_t: string, _adding: number) =>
      over ? { ok: false, used: 5, limit: 5 } : { ok: true, used: 3, limit: 50 },
    ),
  } as unknown as QuotaService;
}

function isolationContext(tenantId?: string) {
  return { tenantId: tenantId } as unknown as TenantIsolationService;
}

describe('QuotaGuard (S7 · FR-7 opt-in 逐路由·S2 后 402 翻译归本守卫)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is a no-op when the route declares no @Quota (opt-in)', async () => {
    const svc = quotaService(false);
    const guard = new QuotaGuard(reflectorReturning(undefined), isolationContext('t1'), svc);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(svc.checkSeats).not.toHaveBeenCalled();
  });

  it('checks seats against the active tenant with the declared delta', async () => {
    const svc = quotaService(false);
    const guard = new QuotaGuard(reflectorReturning({ seats: 3 }), isolationContext('t1'), svc);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(svc.checkSeats).toHaveBeenCalledWith('t1', 3);
  });

  it('defaults the delta to 1 when @Quota is declared without seats', async () => {
    const svc = quotaService(false);
    const guard = new QuotaGuard(reflectorReturning({}), isolationContext('t1'), svc);
    await guard.canActivate(ctx());
    expect(svc.checkSeats).toHaveBeenCalledWith('t1', 1);
  });

  it('fails closed (403) when there is no active tenant context', async () => {
    const svc = quotaService(false);
    const guard = new QuotaGuard(
      reflectorReturning({ seats: 1 }),
      isolationContext(undefined),
      svc,
    );
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.checkSeats).not.toHaveBeenCalled();
  });

  it('translates an over-quota verdict into 402 with the billing errorCode (S2·P1 消费点翻译)', async () => {
    const guard = new QuotaGuard(
      reflectorReturning({ seats: 1 }),
      isolationContext('t1'),
      quotaService(true),
    );
    // Nest 12 基类 HttpException(msg, status, { errorCode }) 的 getResponse() 为裸串——
    // errorCode 落实例属性（过滤器 http-exception.filter 自该属性兜底读取·见其 :56 注释）。
    await expect(guard.canActivate(ctx())).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
      errorCode: 'BILLING:SEAT_LIMIT_EXCEEDED',
    });
  });
});

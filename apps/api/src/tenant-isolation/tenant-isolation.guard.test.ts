import { IS_PUBLIC_KEY } from '@core/saas-kit/tenant-isolation/public.decorator';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { IS_TENANT_ISOLATION_EXEMPT_KEY } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

/** S11 复合全局：TenantIsolationGuard 现读路由元数据·ctx 须供 getHandler/getClass。 */
const ctx = {
  switchToHttp: () => ({}),
  getHandler: () => function handler() {},
  getClass: () => class Controller {},
} as unknown as ExecutionContext;

/** 默认无 @Public/@TenantIsolationExempt（旁路不触发·落到租户裁决）。 */
function reflectorStub() {
  return { getAllAndOverride: () => undefined } as never;
}

/** 声明豁免：任一豁免键命中即旁路。 */
function exemptReflector() {
  return {
    getAllAndOverride: (key: symbol) =>
      key === IS_TENANT_ISOLATION_EXEMPT_KEY || key === IS_PUBLIC_KEY,
  } as never;
}

describe('TenantIsolationGuard (S2 · FR-5 fail-closed · S11 全局租户墙 · rehierarchy 切片 C 主轴 tenantId)', () => {
  it('allows when an active tenant is bound', () => {
    const guard = new TenantIsolationGuard(
      { tenantId: 'tenantA' } as unknown as TenantIsolationService,
      reflectorStub(),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects with 403 when there is no active tenant', () => {
    const guard = new TenantIsolationGuard(
      { tenantId: undefined } as unknown as TenantIsolationService,
      reflectorStub(),
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('S11 · @TenantIsolationExempt 旁路：声明豁免的路由跳过租户墙（无 tenant 亦放行·不抛 403）', () => {
    const guard = new TenantIsolationGuard(
      { tenantId: undefined } as unknown as TenantIsolationService,
      exemptReflector(),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

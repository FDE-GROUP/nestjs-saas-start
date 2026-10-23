import type { CanRequirement } from '@core/saas-kit/authorization/can.decorator';
import { TenantPermissionGuard } from '@core/saas-kit/authorization/tenant-permission.guard';
import type { TenantPermissionChecker } from '@core/saas-kit/authorization/tenant-permission.port';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeContext(): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/**
 * module-rbac-casl §2.2 换形 + module-rbac-dynamic-roles S2 后的守卫契约：守卫经
 * `TenantPermissionChecker` 端口消费**异步**布尔裁决（规则源 DB），输入 = `@Can` 声明
 * (action, subject) + ALS 预注入角色 + 活动租户 organizationId（规则分区键·丙裁）。
 * 「规则 → CASL ability 判定」由工厂/适配测覆盖，守卫测试只锁声明→端口的形状。
 */
function makeGuard({
  organizationId,
  role,
  requirement,
  allowed,
}: {
  organizationId?: string;
  role?: 'owner' | 'admin' | 'member';
  requirement?: CanRequirement;
  allowed?: boolean;
}) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requirement) };
  const tenantContext = { organizationId, role } as never;
  const can = vi.fn().mockResolvedValue(allowed ?? false);
  const checker = { can } as unknown as TenantPermissionChecker;
  const guard = new TenantPermissionGuard(reflector as never, tenantContext, checker);
  return { guard, can, reflector };
}

describe('TenantPermissionGuard（CASL 换形）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: rejects when there is no active tenant', async () => {
    const { guard, can } = makeGuard({
      organizationId: undefined,
      requirement: { action: 'create', subject: 'Member' },
    });
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
    expect(can).not.toHaveBeenCalled();
  });

  it('allows an in-tenant request that declares no @Can requirement', async () => {
    const { guard, can } = makeGuard({ organizationId: 'org_1' });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(can).not.toHaveBeenCalled();
  });

  it('grants when the checker reports the requirement is satisfied（端口收 ALS 注入的角色 + 租户）', async () => {
    const { guard, can } = makeGuard({
      organizationId: 'org_1',
      role: 'admin',
      requirement: { action: 'create', subject: 'Member' },
      allowed: true,
    });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith({
      organizationId: 'org_1',
      role: 'admin',
      action: 'create',
      subject: 'Member',
    });
  });

  it('rejects (403) when the member lacks the required permission', async () => {
    const { guard } = makeGuard({
      organizationId: 'org_1',
      role: 'member',
      requirement: { action: 'delete', subject: 'Organization' },
      allowed: false,
    });
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
  });

  it('缺角色（ALS 未注入）以 role=undefined 交端口 → 桩拒 → 403（fail-closed 贯通）', async () => {
    const { guard, can } = makeGuard({
      organizationId: 'org_1',
      role: undefined,
      requirement: { action: 'read', subject: 'Workspace' },
      allowed: false,
    });
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
    expect(can).toHaveBeenCalledWith({
      organizationId: 'org_1',
      role: undefined,
      action: 'read',
      subject: 'Workspace',
    });
  });
});

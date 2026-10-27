import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import type { CanRequirement } from '@core/saas-kit/authorization/can.decorator';
import type { PermissionChecker } from '@core/saas-kit/authorization/permission.port';
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
 * `PermissionChecker` 端口消费**异步**布尔裁决（规则源 DB），输入 = `@Can` 声明
 * (action, subject) + ALS 预注入角色 + 活动租户 tenantId（规则分区键·丙裁）。
 * rehierarchy 切片 C 换轴：fail-closed 闸与分区键均锚主轴 tenantId（缺租户上下文 403）。
 * 「规则 → CASL ability 判定」由工厂/适配测覆盖，守卫测试只锁声明→端口的形状。
 */
function makeGuard({
  tenantId,
  role,
  requirement,
  allowed,
}: {
  tenantId?: string;
  role?: 'owner' | 'admin' | 'member';
  requirement?: CanRequirement;
  allowed?: boolean;
}) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requirement) };
  const tenantContext = { tenantId, role } as never;
  const can = vi.fn().mockResolvedValue(allowed ?? false);
  const checker = { can } as unknown as PermissionChecker;
  const guard = new AuthorizationGuard(reflector as never, tenantContext, checker);
  return { guard, can, reflector };
}

describe('AuthorizationGuard（CASL 换形）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: rejects when there is no active tenant', async () => {
    const { guard, can } = makeGuard({
      tenantId: undefined,
      requirement: { action: 'create', subject: 'Member' },
    });
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
    expect(can).not.toHaveBeenCalled();
  });

  it('allows an in-tenant request that declares no @Can requirement', async () => {
    const { guard, can } = makeGuard({ tenantId: 'tenant_1' });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(can).not.toHaveBeenCalled();
  });

  it('grants when the checker reports the requirement is satisfied（端口收 ALS 注入的角色 + 租户）', async () => {
    const { guard, can } = makeGuard({
      tenantId: 'tenant_1',
      role: 'admin',
      requirement: { action: 'create', subject: 'Member' },
      allowed: true,
    });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith({
      tenantId: 'tenant_1',
      role: 'admin',
      action: 'create',
      subject: 'Member',
    });
  });

  it('rejects (403) when the member lacks the required permission', async () => {
    const { guard } = makeGuard({
      tenantId: 'tenant_1',
      role: 'member',
      requirement: { action: 'delete', subject: 'Organization' },
      allowed: false,
    });
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
  });

  it('X7 切片 C（推翻 D1・废 D6）：即便会话有活动 org，裁决仍只按活动租传（不再透传 org）', async () => {
    // 旧 D1「常规路由透传活动 org」/ 旧 D6「tenantWildcardOnly 强制忽略 org」皆已随组织收窄维废除——
    // 守卫对 PermissionChecker 的入参形不再含任何 org 字段（授权只锤活动租裁决）。
    const { guard, can } = makeGuard({
      tenantId: 'tenant_1',
      role: 'admin',
      requirement: { action: 'create', subject: 'Invitation' },
      allowed: true,
    });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith({
      tenantId: 'tenant_1',
      role: 'admin',
      action: 'create',
      subject: 'Invitation',
    });
    // 反钉：传入对象不得再携 organizationId 键（废维彻底·非仅传 undefined）。
    expect(can.mock.calls[0]?.[0]).not.toHaveProperty('organizationId');
  });

  it('缺角色（ALS 未注入）以 role=undefined 交端口 → 桩拒 → 403（fail-closed 贯通）', async () => {
    const { guard, can } = makeGuard({
      tenantId: 'tenant_1',
      role: undefined,
      requirement: { action: 'read', subject: 'Workspace' },
      allowed: false,
    });
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ForbiddenException);
    expect(can).toHaveBeenCalledWith({
      tenantId: 'tenant_1',
      role: undefined,
      action: 'read',
      subject: 'Workspace',
    });
  });
});

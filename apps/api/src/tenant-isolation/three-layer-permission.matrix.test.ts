import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import type { PermissionChecker } from '@core/saas-kit/authorization/permission.port';
import type { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { PlatformSettings } from '@core/saas-kit/platform/platform-config.port';
import type { PlatformIdentityLookup } from '@core/saas-kit/platform/platform-identity.port';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import type { RequestSessionReader } from '@core/saas-kit/tenant-isolation/session/request-session.port';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * S8 · FR-11 三层权限收口矩阵。
 *
 * 逐层守卫的 happy-path 细节已由各自的单测覆盖；本矩阵刻意把**三层放在一起**，锁死 FR-11 的
 * 三条跨层不变量——① 各层各自 fail-closed；② **互不授予**（平台 operator 身份不自动换来租户
 * 作用域、租户 admin 换不来平台权、用户级认证只及自身）；③ **校验顺序 / 暂停联动**（用户被暂停
 * → 用户层 403、平台层纵深 403、中间件不绑 tenant/identity → 租户层 403）。一旦有人把守卫合并、
 * 接线顺序改动或引入散点特判，此矩阵即红。
 */

interface SessionResult {
  user?: { id?: string; email?: string };
  session?: { activeOrganizationId?: string };
}

/** 每个断言用**全新 req 对象**，避免 resolveRequestSession 的 WeakMap 跨场景命中缓存。 */
function ctxWith(headers: Record<string, string> = {}): {
  ctx: ExecutionContext;
  req: Record<string, unknown>;
} {
  const req: Record<string, unknown> = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function authWith(session: SessionResult | null) {
  const api = {
    getSession: vi.fn().mockResolvedValue(session),
  };
  return { get: () => ({ api }), set: () => {} } as unknown as InjectAuthInstance;
}

/**
 * §9.5.4①B · P1b：平台/租户守卫经 core 端口消费会话与裁决（SessionGuard 仍属 auth 模块·用 authInstance）。
 */
function sessionReader(session: SessionResult | null): RequestSessionReader {
  const view = session
    ? {
        userId: session.user?.id ? String(session.user.id) : undefined,
        activeOrganizationId: session.session?.activeOrganizationId,
      }
    : null;
  return { read: async () => view } as unknown as RequestSessionReader;
}

/** module-rbac-casl 换形 + dynamic-roles S2：端口消费异步 can({tenantId,role,action,subject})·裁决引擎在 CASL 适配侧（规则源 DB）。rehierarchy 切片 C：投影分区键换主轴 tenantId（租级角色）。 */
function permissionChecker(allowed: boolean): PermissionChecker {
  return { can: async () => allowed } as unknown as PermissionChecker;
}

function userStatus(blocked = false): UserStatusService {
  return { isBlocked: async () => blocked } as unknown as UserStatusService;
}

/** S11：全局墙下 SessionGuard 新增 Reflector 依赖·默认无 @Public（旁路不触发）。 */
function reflectorStub() {
  return { getAllAndOverride: () => undefined } as never;
}

function emailLookup(email: string | null): PlatformIdentityLookup {
  return { emailOf: async () => email ?? undefined };
}

function config(email: string): PlatformSettings {
  return { operatorEmail: () => email } as unknown as PlatformSettings;
}

describe('三层权限收口矩阵 (S8 · FR-11 互不授予 / fail-closed / 校验顺序)', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('① 各层各自 fail-closed', () => {
    it('用户级：无会话 → SessionGuard 401', async () => {
      const { ctx } = ctxWith();
      const guard = new SessionGuard(authWith(null), userStatus(), reflectorStub());
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('租户级：ALS 无 tenant → TenantIsolationGuard 403', () => {
      const tcs = new TenantIsolationService();
      const guard = new TenantIsolationGuard(tcs, reflectorStub());
      const { ctx } = ctxWith();
      expect(() => tcs.run({ userId: 'u1' }, () => guard.canActivate(ctx))).toThrow(
        ForbiddenException,
      );
    });

    it('平台级：无会话 → PlatformOperatorGuard 401', async () => {
      const { ctx } = ctxWith();
      const guard = new PlatformOperatorGuard(
        sessionReader(null),
        emailLookup('admin@x.com'),
        config('admin@x.com'),
        userStatus(),
      );
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('② 互不授予', () => {
    it('平台 operator 有效会话但无 activeOrganizationId → 进不了租户路由（平台权不授予租户作用域）', () => {
      const tcs = new TenantIsolationService();
      const scope = new TenantIsolationGuard(tcs, reflectorStub());
      // operator 已认证（有会话），但未选定任何租户 → ALS 无 organizationId
      const { ctx } = ctxWith();
      expect(() => tcs.run({ userId: 'op-1' }, () => scope.canActivate(ctx))).toThrow(
        ForbiddenException,
      );
    });

    it('租户 admin（有有效租户作用域 + member 权限）拿不到平台权（email 非 operator）', async () => {
      const { ctx } = ctxWith();
      // 会话有效、处于某租户，但 DB email 不命中 operator 配置 → 平台层拒绝
      const guard = new PlatformOperatorGuard(
        sessionReader({ user: { id: 'tm-1' }, session: { activeOrganizationId: 'org_1' } }),
        emailLookup('tenant-admin@corp.com'),
        config('admin@x.com'),
        userStatus(),
      );
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('用户级 SessionGuard 只绑定自身身份，不授予任何租户/角色', async () => {
      const { ctx, req } = ctxWith();
      const guard = new SessionGuard(
        authWith({ user: { id: 'u9', email: 'u9@x.com' } }),
        userStatus(),
        reflectorStub(),
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.sessionUser).toEqual({ id: 'u9', email: 'u9@x.com' });
      // 认证 ≠ 租户访问：紧随其后的租户守卫在无 tenant 绑定时仍 403
      const tcs = new TenantIsolationService();
      const scope = new TenantIsolationGuard(tcs, reflectorStub());
      expect(() => tcs.run({ userId: 'u9' }, () => scope.canActivate(ctx))).toThrow(
        ForbiddenException,
      );
    });

    it('租户权限缺失时 CASL 裁决 deny → AuthorizationGuard 403（租户权不外溢）', async () => {
      const tcs = new TenantIsolationService();
      const reflector = {
        getAllAndOverride: () => ({ action: 'delete', subject: 'Organization' }),
      };
      const guard = new AuthorizationGuard(reflector as never, tcs, permissionChecker(false));
      const { ctx } = ctxWith({ cookie: 's' });
      // 主轴 tenantId 已绑 → 过 fail-closed 闸 → 抵达 CASL deny 路径（而非缺上下文红）。
      await expect(
        tcs.run({ tenantId: 'tenant_1', organizationId: 'org_1', userId: 'm' }, () =>
          guard.canActivate(ctx),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('③ 校验顺序 / 暂停联动（用户被暂停 → 三层皆失权）', () => {
    const blockedSession = {
      user: { id: 'sb', email: 'sb@x.com' },
      session: { activeOrganizationId: 'org_1' },
    };

    it('用户层：SessionGuard 对暂停用户 403', async () => {
      const { ctx } = ctxWith();
      const guard = new SessionGuard(authWith(blockedSession), userStatus(true), reflectorStub());
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('平台层：暂停用户即便 email 命中 operator 亦 403（纵深防御）', async () => {
      const { ctx } = ctxWith();
      const guard = new PlatformOperatorGuard(
        sessionReader(blockedSession),
        emailLookup('admin@x.com'),
        config('admin@x.com'),
        userStatus(true),
      );
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('租户层：中间件对暂停用户不绑 tenant/identity → TenantIsolationGuard 403', () => {
      const tcs = new TenantIsolationService();
      const scope = new TenantIsolationGuard(tcs, reflectorStub());
      const { ctx } = ctxWith();
      // deny-list 结果：blocked 用户 → organizationId/userId 均 undefined
      expect(() => tcs.run({}, () => scope.canActivate(ctx))).toThrow(ForbiddenException);
    });
  });
});

import 'reflect-metadata';
import { AppModule } from '@app/app.module';
import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import {
  TENANT_RBAC_REPOSITORY,
  type TenantRbacRepository,
} from '@app/modules/authorization/domain/repositories/organization-rbac.repository';
import { CaslPermissionChecker } from '@app/modules/authorization/infrastructure/casl-permission.checker';
import { ConfigPlatformSettings } from '@app/modules/platform/infrastructure/config-platform.settings';
import { MikroPlatformIdentityLookup } from '@app/modules/platform/infrastructure/mikro-platform-identity.lookup';
import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { PERMISSION_CHECKER } from '@core/saas-kit/authorization/permission.port';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { PLATFORM_SETTINGS } from '@core/saas-kit/platform/platform-config.port';
import { PLATFORM_IDENTITY_LOOKUP } from '@core/saas-kit/platform/platform-identity.port';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { SESSION_READER } from '@core/saas-kit/tenant-isolation/session/request-session.port';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { TenantIsolationMiddleware } from '@core/saas-kit/tenant-isolation/tenant-isolation.middleware';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import {
  TENANT_SCOPE_RESOLVER,
  type TenantScopeResolver,
} from '@core/saas-kit/tenant-isolation/tenant-scope-resolver.port';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthSessionReader } from './infrastructure/auth-session.reader';

/**
 * S9 · NFR-7 DI / 租户上下文集成测试（对齐 `design:paramtypes` 回归）。
 *
 * 覆盖历片一直**未被真实 DI 容器**验证的接线面：`TenantIsolationModule` 的守卫/中间件此前全部经
 * `new Guard(...)` 手工实例化单测（矩阵/越界），`app.module.test.ts` 只做 `import()` 冒烟——
 * 二者都不触发 Nest 依 `design:paramtypes` 解析构造依赖。本切片把整条鉴权栈放进真实
 * `Test.createTestingModule`，锁死两件事：
 *
 * 1. **元数据擦除防线**（`import type` 陷阱）：`TenantIsolationGuard`（裸 `TenantIsolationService`）与
 *    `AuthorizationGuard`（裸 `Reflector`+`TenantIsolationService`）的构造参数**无 `@Inject` token**，
 *    完全依赖 unplugin-swc 的 `emitDecoratorMetadata` 在 Vitest 下发出真实类。一旦被误改成纯类型导入
 *    擦除（metadata 变 `Object`），DI 当场崩、`design:paramtypes` 断言先红。
 * 2. **ALS 端到端传播**：真实 `TenantIsolationMiddleware` 把 `activeOrganizationId`/`x-workspace-id` 绑进
 *    AsyncLocalStorage，`next()` 内读到的即守卫将读到的同一上下文；deny-list（无 cookie / 暂停租户）
 *    回落到「无租户」→ `TenantIsolationGuard` fail-closed 403。
 *
 * 刻意**不做** HTTP 全栈往返（`app.inject` 打真实路由）——那属仍在挂账的「全栈 e2e」，需真实
 * session/CSRF；此处聚焦 DI 解析 + ALS 传播，二者恰是历片测试的盲区。
 */

interface FakeSession {
  session?: { activeOrganizationId?: string };
  user?: { id?: string; email?: string };
}

/** 提供 AuthInstanceInjectKey 的桩：`.get()` 返回带 `api.getSession` 的对象（守卫做 `auth.api.xxx`）。 */
function authStub(session: FakeSession | null) {
  return {
    get: () => (session ? { api: { getSession: async () => session } } : undefined),
    set: () => {},
  };
}

function configStub(email = 'admin@x.com') {
  return { operatorEmail: () => email };
}

/**
 * rehierarchy 切片 C：中间件新增 `TENANT_SCOPE_RESOLVER` 依赖（活动组织 → 主轴 tenantId）。
 * 第三次复裁切片 3：解析形改 `{ tenantId, orgVisibility }` 作用域（本桩缺省 shared）。测试桩纯读不触库
 * （真适配 MikroTenantScopeResolver 由 AppModule ⑤ 整树坐实）。
 */
function tenantScopeStub(
  tenantId: string | undefined = 'tenant_1',
  orgVisibility?: string,
): TenantScopeResolver {
  return {
    resolveTenantScopeOf: async () => (tenantId ? { tenantId, orgVisibility } : undefined),
    // 切片 4·D7：显式租激活路径的可见性直读桩（本组测试走 org 派生·不触此支）。
    readOrgVisibility: async () => orgVisibility,
  } as unknown as TenantScopeResolver;
}

/** 在 ALS 作用域内驱动真实中间件，回传 next() 执行期间的观测值。 */
function driveMiddleware(
  mw: TenantIsolationMiddleware,
  req: Record<string, unknown>,
  observe: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    mw.use(req, {}, () => {
      try {
        observe();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

describe('S9 · Tenancy DI / 上下文集成（design:paramtypes 回归 + ALS 传播）', () => {
  describe('① design:paramtypes 元数据回归（裸类型注入不受 import type 擦除影响）', () => {
    it('TenantIsolationGuard 第一构造参数携带真实 TenantIsolationService 类（非 Object）', () => {
      const types = Reflect.getMetadata('design:paramtypes', TenantIsolationGuard) as unknown[];
      expect(types[0]).toBe(TenantIsolationService);
    });

    it('AuthorizationGuard 前两参携带真实 Reflector / TenantIsolationService（无 token，纯元数据解析）', () => {
      const types = Reflect.getMetadata('design:paramtypes', AuthorizationGuard) as unknown[];
      expect(types[0]).toBe(Reflector);
      expect(types[1]).toBe(TenantIsolationService);
      // 第三参 checker 经 @Inject(PERMISSION_CHECKER) token 注入，元数据可为 Object（属预期）。
    });
  });

  describe('② 真实 Nest DI 容器解析整条鉴权栈（.get() 触发实例化，元数据缺失即崩）', () => {
    it('守卫/中间件均可由容器无手工 new 解析出实例', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          TenantIsolationService,
          TenantIsolationGuard,
          AuthorizationGuard,
          PlatformOperatorGuard,
          SessionGuard,
          TenantIsolationMiddleware,
          Reflector,
          { provide: AuthInstanceInjectKey, useValue: authStub(null) },
          { provide: PLATFORM_SETTINGS, useValue: configStub() },
          { provide: PLATFORM_IDENTITY_LOOKUP, useValue: { emailOf: async () => undefined } },
          // §9.5.4①B · P1b：守卫/中间件经会话/裁决端口消费·此处用真实适配类坐实 DI 解析（依赖全局 AuthInstanceInjectKey）。
          { provide: SESSION_READER, useClass: AuthSessionReader },
          { provide: PERMISSION_CHECKER, useClass: CaslPermissionChecker },
          // S2：checker 现依赖 TENANT_RBAC_REPOSITORY 投影源——此处桩住（不触库），坐实注入可解析。
          {
            provide: TENANT_RBAC_REPOSITORY,
            useValue: {
              ensureSystemRoles: async () => {},
              findGrants: async () => null,
            } as unknown as TenantRbacRepository,
          },
          { provide: UserStatusService, useValue: { isBlocked: async () => false } },
          // 治理换轴（E-F）：中间件失能卡点改注入 TenantStatusService（读 tenant.status）。
          { provide: TenantStatusService, useValue: { isBlocked: async () => false } },
          // 切片 C：中间件主轴派生端口（坐实 DI 可解析·不触库）。
          { provide: TENANT_SCOPE_RESOLVER, useValue: tenantScopeStub() },
        ],
      }).compile();

      // 解析（非 merely 注册）会执行构造，依赖不满足则 Nest 抛 "can't resolve"。
      expect(moduleRef.get(TenantIsolationService)).toBeInstanceOf(TenantIsolationService);
      expect(moduleRef.get(TenantIsolationGuard)).toBeInstanceOf(TenantIsolationGuard);
      expect(moduleRef.get(AuthorizationGuard)).toBeInstanceOf(AuthorizationGuard);
      expect(moduleRef.get(PlatformOperatorGuard)).toBeInstanceOf(PlatformOperatorGuard);
      expect(moduleRef.get(SessionGuard)).toBeInstanceOf(SessionGuard);
      expect(moduleRef.get(TenantIsolationMiddleware)).toBeInstanceOf(TenantIsolationMiddleware);
    });
  });

  describe('③ ALS 端到端传播：真实 TenantIsolationMiddleware → TenantIsolationGuard / TenantIsolationService', () => {
    let tcs: TenantIsolationService;
    let scope: TenantIsolationGuard;
    let mw: TenantIsolationMiddleware;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          TenantIsolationService,
          TenantIsolationGuard,
          TenantIsolationMiddleware,
          {
            provide: AuthInstanceInjectKey,
            useValue: authStub({ session: { activeOrganizationId: 'org_1' }, user: { id: 'u1' } }),
          },
          // 中间件经真实 AuthSessionReader 适配→保留 getSession→ALS 端到端传播保真度。
          { provide: SESSION_READER, useClass: AuthSessionReader },
          { provide: UserStatusService, useValue: { isBlocked: async () => false } },
          { provide: TenantStatusService, useValue: { isBlocked: async () => false } },
          // 切片 C：活动组织 org_1 → 主轴 tenant_1（守卫 TenantIsolationGuard 现读 tenantId fail-closed）。
          { provide: TENANT_SCOPE_RESOLVER, useValue: tenantScopeStub('tenant_1') },
        ],
      }).compile();
      tcs = moduleRef.get(TenantIsolationService);
      scope = moduleRef.get(TenantIsolationGuard);
      mw = moduleRef.get(TenantIsolationMiddleware);
    });

    it('携带会话 cookie + x-workspace-id → 中间件绑 tenant/workspace 进 ALS，守卫同请求内放行', async () => {
      const req = { headers: { cookie: 'session=abc', 'x-workspace-id': 'ws_9' }, url: '/posts' };
      const seen: { tenant?: string; workspace?: string; ok?: boolean; required?: string } = {};

      await driveMiddleware(mw, req, () => {
        seen.tenant = tcs.organizationId;
        seen.workspace = tcs.workspaceId;
        seen.required = tcs.requireActiveOrganizationId();
        // TenantIsolationGuard 读同一 ALS store + 路由元数据（S11 全局化后需 getHandler/getClass·无豁免键则不旁路）。
        seen.ok = scope.canActivate({
          getHandler: () => () => {},
          getClass: () => class {},
        } as never);
      });

      expect(seen.tenant).toBe('org_1');
      expect(seen.workspace).toBe('ws_9');
      expect(seen.required).toBe('org_1');
      expect(seen.ok).toBe(true);
    });

    it('无 cookie（公开/旁路路径）→ 中间件不绑 ALS → TenantIsolationGuard fail-closed 403', async () => {
      const req = { headers: {}, url: '/posts' };
      let thrown: unknown = null;
      let tenantInView: string | undefined = 'sentinel';

      await driveMiddleware(mw, req, () => {
        tenantInView = tcs.organizationId;
        try {
          scope.canActivate({ getHandler: () => () => {}, getClass: () => class {} } as never);
        } catch (err) {
          thrown = err;
        }
      });

      expect(tenantInView).toBeUndefined();
      expect(thrown).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('④ deny-list 暂停租户经真实中间件失能（S4/S6 接线在 ALS 层坐实）', () => {
    it('租户被暂停（tenantStatus.isBlocked=true）→ 中间件绑空 → 守卫 403', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          TenantIsolationService,
          TenantIsolationGuard,
          TenantIsolationMiddleware,
          {
            provide: AuthInstanceInjectKey,
            useValue: authStub({
              session: { activeOrganizationId: 'org_susp' },
              user: { id: 'u2' },
            }),
          },
          { provide: SESSION_READER, useClass: AuthSessionReader },
          { provide: UserStatusService, useValue: { isBlocked: async () => false } },
          { provide: TenantStatusService, useValue: { isBlocked: async () => true } },
          // 治理换轴（E-F）：先派生 tenant_susp、再对**租户**判失能→ isBlocked=true → bind(undefined) → 守卫 403。
          { provide: TENANT_SCOPE_RESOLVER, useValue: tenantScopeStub('tenant_susp') },
        ],
      }).compile();
      const tcs = moduleRef.get(TenantIsolationService);
      const scope = moduleRef.get(TenantIsolationGuard);
      const mw = moduleRef.get(TenantIsolationMiddleware);

      const req = { headers: { cookie: 'session=abc' }, url: '/posts' };
      let thrown: unknown = null;
      let tenantInView: string | undefined = 'sentinel';

      await driveMiddleware(mw, req, () => {
        tenantInView = tcs.organizationId;
        try {
          scope.canActivate({ getHandler: () => () => {}, getClass: () => class {} } as never);
        } catch (err) {
          thrown = err;
        }
      });

      expect(tenantInView).toBeUndefined();
      expect(thrown).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('⑤ D 片 · PlatformModule 真实装配（整树 AppModule 下闸门/审计/端口适配在新家可解析）', () => {
    it('AppModule 整树（含 PlatformModule @Global）解析 guard/audit/两端口适配·DB-free', async () => {
      // 与 app-boot.smoke 同源的全树 compile（MikroOrmService 懒建不连库）：证平台件由
      // **新上下文真实装配**供给（tenancy 已不再自住），非手工桩依赖。
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

      expect(moduleRef.get(PlatformOperatorGuard)).toBeInstanceOf(PlatformOperatorGuard);
      expect(moduleRef.get(PlatformAuditService)).toBeInstanceOf(PlatformAuditService);
      expect(moduleRef.get(PLATFORM_IDENTITY_LOOKUP)).toBeInstanceOf(MikroPlatformIdentityLookup);
      expect(moduleRef.get(PLATFORM_SETTINGS)).toBeInstanceOf(ConfigPlatformSettings);
    });
  });
});

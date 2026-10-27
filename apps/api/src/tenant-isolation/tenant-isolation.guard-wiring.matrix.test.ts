import 'reflect-metadata';
import { PostsController } from '@app/modules/posts/api/posts.controller';
import { SubscriptionsController } from '@app/modules/subscriptions/api/subscriptions.controller';
import { WorkspacesController } from '@app/modules/workspaces/api/workspaces.controller';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { describe, expect, it } from 'vitest';

/**
 * 租户守卫接线回归防线（S11 补遗 · 高危#4）。
 *
 * **事实订正**：`TenantIsolationGuard` 已注册为全局 `APP_GUARD`（`TenantIsolationModule`·deny-by-default
 * 租户墙·见 tenant-isolation.module.ts 的 `{ provide: APP_GUARD, useExisting: TenantIsolationGuard }`），
 * 运行于全局 `SessionGuard` 之后（401 先于 403）。所有路由默认要求已绑 active 租户，唯 `@Public()` /
 * `@TenantIsolationExempt()` 两轴旁路。**此前本文件头注「租户层不接全局 TenantIsolationGuard」为失真陈述
 * （P0 评审 X·守卫矩阵矛盾·曾误导审计），现予订正。**
 *
 * 本矩阵保留的价值是**纵深防御的接线对拍**：凡后端触及租户自服务仓储（`requireActiveTenantId()` 卡点·
 * 隔离主轴）的 @Controller，其每条路由仍应**显式**挂 `TenantIsolationGuard`（与全局并存·幂等），一旦有人
 * 新散点漏挂或错误移除显式挂载/放宽豁免，此矩阵即红。行级隔离本身由全局 MikroORM filter（切片 1）兜底。
 *
 * **SSOT 真相源**：租户自服务仓储 = `{ post, workspace, subscription }`（`grep requireActiveTenantId()` 坐实·
 * 隔离主轴）；`requireActiveOrganizationId()` 系写归属/派生的**次轴**（散布 odoo/storage/governance 等非隔离点），
 * 不属本防线。平台/跨租仓储按**参数** `tenantId` 而非 ALS 卡点，其治理由 `PlatformOperatorGuard` 承担。
 * **维护铁律**：新增走 `requireActiveTenantId()` 仓储的 @Controller 必须并入下方清单，否则其无守卫路由不被覆盖。
 * 跨租 exempt 名册读面（如租户目录）须 `fork({ scoped: false })` 绕全局 filter（P0 X1）——该接线恒等由目录仓储测锁定。
 */

const GUARDS_METADATA = '__guards__';
const PATH_METADATA = 'path';

/** 列出某 controller 上所有真正的路由处理函数（带 `path` 元数据者·排除构造函数与服务方法）。 */
function routeHandlers(controller: new (...args: never[]) => unknown): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== 'constructor' &&
      typeof proto[name] === 'function' &&
      Reflect.getMetadata(PATH_METADATA, proto[name] as object) !== undefined,
  );
}

/** Nest 守卫解析=class 级 ∪ method 级皆生效；此处复现「有效守卫集」。 */
function effectiveGuards(
  controller: new (...args: never[]) => unknown,
  handlerName: string,
): unknown[] {
  const classGuards = Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined;
  const methodGuards = Reflect.getMetadata(
    GUARDS_METADATA,
    (controller.prototype as Record<string, unknown>)[handlerName] as object,
  ) as unknown[] | undefined;
  return [...(classGuards ?? []), ...(methodGuards ?? [])];
}

const TENANT_SCOPED_CONTROLLERS: [string, new (...args: never[]) => unknown][] = [
  ['PostsController', PostsController],
  ['WorkspacesController', WorkspacesController],
  ['SubscriptionsController', SubscriptionsController],
];

describe('租户作用域守卫接线回归防线（全局 deny-by-default + 逐路由显式纵深·防散点漏挂）', () => {
  it('租户自服务仓储卡点确为 { post, workspace, subscription }·清单同步', () => {
    expect(TENANT_SCOPED_CONTROLLERS.map(([n]) => n).sort()).toEqual([
      'PostsController',
      'SubscriptionsController',
      'WorkspacesController',
    ]);
  });

  for (const [name, controller] of TENANT_SCOPED_CONTROLLERS) {
    it(`${name}：每条路由的有效守卫集都含 TenantIsolationGuard`, () => {
      const handlers = routeHandlers(controller);
      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        const guards = effectiveGuards(controller, handler);
        expect(
          guards.includes(TenantIsolationGuard),
          `${name}.${handler} 缺少 TenantIsolationGuard（触及租户仓储的路由必须 fail-closed 于路由层）`,
        ).toBe(true);
      }
    });
  }
});

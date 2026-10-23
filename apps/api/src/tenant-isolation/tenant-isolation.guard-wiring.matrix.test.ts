import 'reflect-metadata';
import { PostsController } from '@app/modules/posts/api/posts.controller';
import { SubscriptionsController } from '@app/modules/subscriptions/api/subscriptions.controller';
import { WorkspacesController } from '@app/modules/workspaces/api/workspaces.controller';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { describe, expect, it } from 'vitest';

/**
 * S11 补遗 · 「会话+租户」复合全局的**务实收口**形态（高危#4·经人裁采回归防线而非全局 `TenantIsolationGuard`）。
 *
 * 会话墙已全局化（S11 deny-by-default `SessionGuard`）；但**租户层不接全局 `TenantIsolationGuard`**——
 * 因租户隔离的实际强制点已在**仓储 `requireActiveOrganizationId()` 卡点** fail-closed（S2·仓储层唯一隔离卡点），
 * 而全局化会锁死所有「已认证但无 active 租户」的合法流（建租申请 / 平台治理 / 个人 PIPL / 未选组织），
 * 需另开一整套 `@TenantIsolationExempt` 豁免轴（维护负担 + 漏标即死锁）。故本片的真实收益（路由层更早统一 403）
 * 以**回归防线**取得：锁死「凡后端触及租户自服务仓储（`requireActiveOrganizationId`）的 @Controller，每条路由都挂
 * `TenantIsolationGuard`」，一旦有人新散点漏挂或移除守卫，此矩阵即红。
 *
 * **SSOT 真相源**：租户自服务仓储 = `{ post, workspace, subscription }`（`grep requireActiveOrganizationId()` 坐实）；
 * 平台/跨租仓储按**参数** `tenantId` 而非 ALS 卡点，不属本防线（其治理由 `PlatformOperatorGuard` 承担）。
 * **维护铁律**：新增走 `requireActiveOrganizationId()` 仓储的 @Controller 必须并入下方清单，否则其无守卫路由不被覆盖。
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

describe('租户作用域守卫接线回归防线（务实收口·不接全局 TenantIsolationGuard·防散点漏挂）', () => {
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

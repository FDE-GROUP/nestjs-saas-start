import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { describe, expect, it } from 'vitest';
import { McpCredentialsController } from './mcp-credentials.controller';

/**
 * MCP 凭证管理面守卫接线对拍（features 区同形防线·tenant-isolation guard-wiring 矩阵同源纪律）。
 *
 * @remarks
 * 矩阵 SSOT 清单硬编码属 `tenant-isolation/`（modules 面），A 面隔离闸禁其 import features——
 * 故本 feature 触及 `requireActiveTenantId()` 仓储（`MCP_ACCESS_TOKEN_STORE` 实现）的路由守卫
 * 接线由本区自锁：每条路由有效守卫集必含 `TenantIsolationGuard`（移除类级挂载即红）。
 * helper 形制逐字沿矩阵（`routeHandlers`/`effectiveGuards`），两区同判据不双标。
 */
const GUARDS_METADATA = '__guards__';
const PATH_METADATA = 'path';

function routeHandlers(controller: new (...args: never[]) => unknown): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== 'constructor' &&
      typeof proto[name] === 'function' &&
      Reflect.getMetadata(PATH_METADATA, proto[name] as object) !== undefined,
  );
}

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

describe('McpCredentialsController 守卫接线（显式纵深·fail-closed）', () => {
  it('路由集恒等（mint/list/revoke 三面皆在·增删路由须同步本卡尺）', () => {
    expect(routeHandlers(McpCredentialsController).sort()).toEqual(['list', 'mint', 'revoke']);
  });

  for (const handler of routeHandlers(McpCredentialsController)) {
    it(`${handler}：有效守卫集含 TenantIsolationGuard`, () => {
      expect(
        effectiveGuards(McpCredentialsController, handler).includes(TenantIsolationGuard),
        `McpCredentialsController.${handler} 缺少 TenantIsolationGuard（触及租户仓储的路由必须 fail-closed 于路由层）`,
      ).toBe(true);
    });
  }
});

import { describe, expect, it } from 'vitest';
import * as mcpCredentialsController from '../../features/mcp/api/mcp-credentials.controller';
import * as odooRpcController from '../../features/odoo-rpc-api/api/odoo-rpc.controller';
import * as authorizationAdminController from '../../modules/authorization/api/authorization-admin.controller';
import * as organizationsController from '../../modules/organizations/api/organizations.controller';
import * as organizationsOrgAdminController from '../../modules/organizations/api/organizations-org-admin.controller';
import * as organizationsSelfController from '../../modules/organizations/api/organizations-self.controller';
import * as tenantsController from '../../modules/organizations/api/tenants.controller';
import * as paymentController from '../../modules/payment/api/payment.controller';
import * as platformTenantsController from '../../modules/platform/api/platform-tenants.controller';
import * as platformUsersController from '../../modules/platform/api/platform-users.controller';
import * as postsController from '../../modules/posts/api/posts.controller';
import * as storageController from '../../modules/storage/api/storage.controller';
import * as subscriptionsController from '../../modules/subscriptions/api/subscriptions.controller';
import * as usersController from '../../modules/users/api/users.controller';
import * as workspacesController from '../../modules/workspaces/api/workspaces.controller';
import * as healthController from '../health/health.controller';
import { APP_ROUTER_SPEC } from './app-router.contract';

/**
 * AppRouterContract 覆盖对拍（WP-E 打底·drift 守卫）。
 *
 * 深走 `APP_ROUTER_SPEC` 收集叶子 procedure，与全部 controller 实导出的 `*Contract` 叶子做**恒等对拍**：
 * - controller 新增 `*Contract` 却漏挂 router → 期望集多出 → 红；
 * - router 挂了但引用错对象 → 身份不匹配 → 红；
 * - 叶子重复挂载 → 计数/集合大小不等 → 红。
 * 把「router 是契约单源」从纪律升为机制，防 WP-F 前端接线时地基静默漂移。
 */

/** 契约叶子判定：ProcedureContract 携 `~orpc`；纯分组对象不携。 */
function isContractLeaf(value: unknown): value is { '~orpc': unknown } {
  return !!value && typeof value === 'object' && '~orpc' in value;
}

function collectLeaves(node: unknown, out: unknown[] = []): unknown[] {
  if (isContractLeaf(node)) {
    out.push(node);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectLeaves(v, out);
  }
  return out;
}

// router 侧叶子（深走）
const routerLeaves = collectLeaves(APP_ROUTER_SPEC);

// controller 侧叶子：各模块 `*Contract` 导出中真为 procedure 契约者。
// 排除聚合型 router 导出（healthContract 包 healthProcedureContract，非独立叶子）。
const ROUTER_EXPORTS = new Set(['healthContract']);
const controllerModules: Record<string, object>[] = [
  authorizationAdminController,
  organizationsController,
  organizationsOrgAdminController,
  organizationsSelfController,
  tenantsController,
  paymentController,
  platformTenantsController,
  platformUsersController,
  postsController,
  storageController,
  subscriptionsController,
  usersController,
  workspacesController,
  mcpCredentialsController,
  odooRpcController,
  healthController,
];
const controllerLeaves = new Set<unknown>();
for (const mod of controllerModules) {
  for (const [key, value] of Object.entries(mod)) {
    if (!key.endsWith('Contract') || ROUTER_EXPORTS.has(key)) continue;
    if (!isContractLeaf(value)) {
      throw new Error(`controller 导出 ${key} 名似契约却无 ~orpc（形态漂移）`);
    }
    controllerLeaves.add(value);
  }
}

describe('AppRouterContract 覆盖对拍', () => {
  it('router 叶子无重复（同引用恒等）', () => {
    expect(routerLeaves.length).toBe(new Set(routerLeaves).size);
  });

  it('router 叶子集 ≡ controller `*Contract` 叶子集（双向恒等·不漏不增）', () => {
    const routerSet = new Set(routerLeaves);
    const missing = [...controllerLeaves].filter((c) => !routerSet.has(c));
    const extra = [...routerSet].filter((c) => !controllerLeaves.has(c));
    expect({ missingCount: missing.length, extraCount: extra.length }).toEqual({
      missingCount: 0,
      extraCount: 0,
    });
  });

  it('叶子总数锁定 61（与实存 procedure 契约面同步·变动须显式确认）', () => {
    expect(routerLeaves).toHaveLength(61);
  });
});

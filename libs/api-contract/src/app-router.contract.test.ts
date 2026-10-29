import { describe, expect, it } from 'vitest';
import { PUBLIC_APP_ROUTER_SPEC } from './app-router.contract';
import * as apiContract from './index';

/**
 * AppRouterContract 覆盖对拍（公共面·契约前置 `@saas/api-contract`·drift 守卫）。
 *
 * 深走 `PUBLIC_APP_ROUTER_SPEC` 收集叶子 procedure，与本包实导出的全部 `*Contract` 叶子做**恒等对拍**：
 * - 域契约新增却漏挂 router → 期望集多出 → 红；
 * - router 挂了但引用错对象 → 身份不匹配 → 红；
 * - 叶子重复挂载 → 计数/集合大小不等 → 红。
 * 把「router 是公共契约单源」从纪律升为机制，防 WP-F 前端接线时地基静默漂移。
 *
 * feature 叠加层（mcp·odoo）契约不入本公共包，其恒等由 `apps/api` 侧覆盖对拍守卫（含 61 全量锁）。
 */

/** 契约叶子判定：ProcedureContract 携 `~orpc`；纯分组/聚合 router 不携。 */
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
const routerLeaves = collectLeaves(PUBLIC_APP_ROUTER_SPEC);

// 契约侧叶子：本包 `*Contract` 导出中真为 procedure 契约者。
// 排除聚合型 router 导出（healthContract 包 healthProcedureContract，非独立叶子）。
const ROUTER_EXPORTS = new Set(['healthContract']);
const contractLeaves = new Set<unknown>();
for (const [key, value] of Object.entries(apiContract)) {
  if (!key.endsWith('Contract') || ROUTER_EXPORTS.has(key)) continue;
  if (!isContractLeaf(value)) {
    throw new Error(`契约导出 ${key} 名似契约却无 ~orpc（形态漂移）`);
  }
  contractLeaves.add(value);
}

describe('AppRouterContract 覆盖对拍（公共面）', () => {
  it('router 叶子无重复（同引用恒等）', () => {
    expect(routerLeaves.length).toBe(new Set(routerLeaves).size);
  });

  it('router 叶子集 ≡ 契约 `*Contract` 叶子集（双向恒等·不漏不增）', () => {
    const routerSet = new Set(routerLeaves);
    const missing = [...contractLeaves].filter((c) => !routerSet.has(c));
    const extra = [...routerSet].filter((c) => !contractLeaves.has(c));
    expect({ missingCount: missing.length, extraCount: extra.length }).toEqual({
      missingCount: 0,
      extraCount: 0,
    });
  });

  it('公共叶子总数锁定 56（与实存 procedure 契约面同步·变动须显式确认）', () => {
    expect(routerLeaves).toHaveLength(56);
  });
});

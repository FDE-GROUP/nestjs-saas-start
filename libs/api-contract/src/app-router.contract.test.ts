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

/** 探针（批 D·M5）：契约叶 `~orpc.outputSchemas` 非空 = 已显式建模输出（与 authorization-admin.controller.test 同源口径）。 */
function hasOutput(leaf: unknown): boolean {
  const def = (leaf as { '~orpc'?: { outputSchemas?: readonly unknown[] } })['~orpc'];
  return (def?.outputSchemas?.length ?? 0) > 0;
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

/** 豁免登记清单（批 D·M5）：有意不建模输出者·逐条带理由·新增缺 output 叶不在此单即红。首版 9 叶（BA passthrough 2 + void 4 + 合法 204 空体 3）。 */
const OUTPUT_EXEMPT: ReadonlyArray<{ leaf: unknown; why: string }> = [
  {
    leaf: apiContract.selfListContract,
    why: 'BA listOrganizations 服务端直调 passthrough·逐字保真',
  },
  {
    leaf: apiContract.selfSetActiveContract,
    why: 'BA setActive passthrough + 本侧清 activeTenantId·逐字保真',
  },
  {
    leaf: apiContract.authzRenameRoleContract,
    why: 'void 语义无载荷（沿 usersDelete 空回执口径）',
  },
  { leaf: apiContract.authzDeleteRoleContract, why: 'void 语义无载荷' },
  { leaf: apiContract.authzGrantContract, why: 'void 语义无载荷' },
  { leaf: apiContract.authzRevokeContract, why: 'void 语义无载荷' },
  // 已建模 204（successStatus 建模·无响应 body·合法不挂 .output）——§1 明确排除在 19 待补面之外：
  {
    leaf: apiContract.usersDeleteContract,
    why: '204 NO_CONTENT 空体（PIPL 硬删·successStatus 建模）',
  },
  { leaf: apiContract.workspacesRemoveContract, why: '204 NO_CONTENT 空体（删 workspace）' },
  { leaf: apiContract.organizationsRejectContract, why: '204 NO_CONTENT 空体（驳待审组织）' },
];

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

  it('公共叶必须显式建模 .output（缺则须登记豁免·三向恒等）', () => {
    const exempt = new Set(OUTPUT_EXEMPT.map((e) => e.leaf));
    // 向①：router 叶缺 output 且未登记 → 漏建模（新 op 忘挂又没豁免）
    const unmodeled = routerLeaves.filter((l) => !hasOutput(l) && !exempt.has(l));
    // 向②：登记豁免却已挂 output → 豁免腐烂 stale（建模后忘撤登记）
    const stale = OUTPUT_EXEMPT.filter((e) => hasOutput(e.leaf));
    expect({ unmodeled: unmodeled.length, stale: stale.length }).toEqual({
      unmodeled: 0,
      stale: 0,
    });
  });

  it('闸探针负例自测（漏挂→判无输出 / 已挂→判有输出）', () => {
    expect(hasOutput({ '~orpc': { outputSchemas: [] } })).toBe(false);
    expect(hasOutput({ '~orpc': { outputSchemas: [{}] } })).toBe(true);
  });
});

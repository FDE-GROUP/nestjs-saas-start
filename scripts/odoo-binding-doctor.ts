/**
 * 租户↔Odoo 公司绑定两向对拍「绑定医生」（module-org-odoo-company-mapping 切片 C · §2.6 · 运维脚本）。
 *
 * 定位（诚实划界）：纯对拍裁决住 `./odoo-binding-drift.ts`（单测逐格锁·无 DB 无 Odoo）；本文件只是**取两侧
 * 事实喂入的 I/O 壳**——SaaS 侧从 `organization` 绑定列读、Odoo 侧从 `res.company` 按确定性命名前缀读在册集，
 * 交纯函数裁决后打印报告。**缺省只读**（零写·绝不改映射/公司），修复动作（重建/回填/清孤儿）归人工与 saga 重试。
 *
 * 两向语义（§1 单源裁决）：
 * - 正向·悬空绑定（ready 却指向 Odoo 缺席公司）→ **必报**（exit 1·Odoo 能力 fail-open 泄漏风险）；
 * - 反向·孤儿公司（在册却无绑定引用）→ **仅告警**（低频审计项·不阻断·exit 0）。
 *
 * 用法（前置 `pnpm run build:libs`——`@core/saas-kit` dist 值导入可解析·沿 es-projection-doctor 先例）：
 *   DATABASE_URL=... ODOO_BASE_URL=... ODOO_DB=... ODOO_LOGIN=... ODOO_API_KEY=... \
 *     pnpm exec tsx scripts/odoo-binding-doctor.ts
 *
 * 本窗无活体 Odoo/联调栈，故本壳不被 CI 执行（判据 = 纯函数单测 + saga/端口语义 e2e）；联调窗以 write/read
 * 凭证真跑对拍（部署面人签后执行）。⚠ tsx 消费链一律相对导入（`@app` 别名 tsx 不解析·沿 sys-entities 头注）。
 */
import '../apps/api/src/load-env.ts';

import { EXPECTED_ODOO_COMPANY_PREFIX } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import type { EntityManager } from '@mikro-orm/core';
import { initMikroOrm } from '../apps/api/src/database/mikro/mikro-orm.factory.ts';
import { MIKRO_SYS_ENTITIES } from '../apps/api/src/database/mikro/sys-entities.ts';
import { Organization } from '../apps/api/src/modules/organizations/infrastructure/entities/ba-org.entities.ts';
import { analyzeBindingDrift, type BindingSnapshot } from './odoo-binding-drift.ts';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[odoo-binding-doctor] DATABASE_URL missing');
  process.exit(1);
}

/** 读 SaaS 侧绑定快照（跨租户天然全量·doctor 非租户级·只读不改）。 */
async function readBindings(em: EntityManager): Promise<BindingSnapshot[]> {
  const rows = (await em.find(Organization, {} as never, {})) as Array<{
    id: string;
    odooCompanyId: number | null;
    odooBindingStatus: string | null;
  }>;
  return rows.map((row) => ({
    organizationId: row.id,
    odooCompanyId: row.odooCompanyId ?? null,
    odooBindingStatus: row.odooBindingStatus ?? null,
  }));
}

/** Odoo JSON-RPC `execute_kw`（原生 fetch·与 feature 客户端同款契约·此处自带以免公共仓 build 依赖未追踪叠加层）。 */
async function odooExecuteKw<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown>,
): Promise<T> {
  const base = process.env.ODOO_BASE_URL;
  const db = process.env.ODOO_DB;
  const login = process.env.ODOO_LOGIN;
  const key = process.env.ODOO_API_KEY;
  if (!base || !db || !login || !key) {
    throw new Error('Odoo 凭证缺席（需 ODOO_BASE_URL/ODOO_DB/ODOO_LOGIN/ODOO_API_KEY）');
  }
  const url = `${base.replace(/\/$/, '')}/jsonrpc`;
  const call = async (params: unknown): Promise<T> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'call', params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
    const env = (await res.json()) as { result?: T; error?: { message?: string } };
    if (env.error) throw new Error(`Odoo 错误：${env.error.message ?? '未知'}`);
    if (env.result === undefined) throw new Error('Odoo 响应缺 result');
    return env.result;
  };
  const uid = await call<number>({
    service: 'common',
    method: 'authenticate',
    args: [db, login, key, {}],
  });
  if (typeof uid !== 'number' || uid <= 0) throw new Error('Odoo 鉴权失败');
  return call<T>({
    service: 'object',
    method: 'execute_kw',
    args: [db, uid, key, model, method, args, kwargs],
  });
}

/** 读 Odoo 侧「本方开通的」公司在册 id（按确定性命名前缀筛·Odoo 自身种子/演示公司不入集·免误报孤儿）。 */
async function readProvisionedCompanyIds(): Promise<number[]> {
  const rows = await odooExecuteKw<Array<{ id: number }>>(
    'res.company',
    'search_read',
    [[['name', 'like', `${EXPECTED_ODOO_COMPANY_PREFIX}%`]]],
    { fields: ['name'], limit: 0 },
  );
  return rows.map((row) => row.id).filter((id) => typeof id === 'number');
}

try {
  const orm = await initMikroOrm(dbUrl, MIKRO_SYS_ENTITIES);
  const em = orm.em.fork();
  const bindings = await readBindings(em);
  const provisionedCompanyIds = await readProvisionedCompanyIds();
  const report = analyzeBindingDrift(bindings, provisionedCompanyIds);

  console.log(
    `[odoo-binding-doctor] 绑定 ${bindings.length} 行 · Odoo 在册开通公司 ${provisionedCompanyIds.length} 个`,
  );
  for (const orphan of report.orphanCompanyIds) {
    console.log(`  ⚠ 孤儿公司（仅告警）：companyId=${orphan}`);
  }
  for (const dangling of report.danglingBindings) {
    console.error(
      `  ✗ 悬空绑定（必报）：org=${dangling.organizationId} 声称 ready 但 companyId=${dangling.odooCompanyId} 在 Odoo 缺席`,
    );
  }
  if (report.danglingBindings.length > 0) {
    console.error('[odoo-binding-doctor] 检出悬空绑定 → exit 1（人工介入：回填/重建/纠正映射）');
    process.exit(1);
  }
  console.log('[odoo-binding-doctor] 正向对拍通过（无悬空绑定）');
} catch (error: unknown) {
  console.error(`[odoo-binding-doctor] 运行失败：${(error as Error).message}`);
  process.exit(1);
}

/**
 * ES R3c —— 投影滞后检测 + catch-up 恢复「投影医生」（module-es-r3-async-projection-ack §2.2-R3c）。
 *
 * 定位（诚实划界·防与 bootstrap `--verify` 双写）：既有 `es-bootstrap-{tenants,subscriptions}.ts --verify`
 * 已实现「单上下文·fold⇄投影只读对拍」，但**只检不修**、且各管一边。本片真增量 = ① 跨上下文（tenants +
 * subscriptions）一次巡检统一面 + ② **恢复/catch-up 面**：检出漂移后可 `--rebuild` 走 `load→fold→upsert`
 * 把投影回写为真相源态（镜像 `rebuildTenantProjection` / `rebuildProjection` 语义·仅复用同一 fold 单源）。
 * 判据与 replay-truth gated e2e 同源（fold==投影逐字段·每流恰 1 条 bootstrapped）。
 *
 * **非高危**：零 DDL、不动 event 流（append-only 真相源永不被本工具改写）、只回写可重建投影表 status；
 * 缺省**只读**（不带 `--rebuild` 绝不改数据），`--rebuild` 为 opt-in 且幂等（写值恒等于 fold 结果=真相）。
 *
 * 用法（前置 `pnpm run build:libs`——`@core/saas-kit` dist 值导入可解析·沿 es-bootstrap 先例）：
 *   pnpm exec tsx scripts/es-projection-doctor.ts                     # 只读巡检两上下文·有漂移 exit 1
 *   pnpm exec tsx scripts/es-projection-doctor.ts --only=tenants      # 只巡检 tenants（或 =subscriptions）
 *   pnpm exec tsx scripts/es-projection-doctor.ts --rebuild           # 检出漂移→对可修者回写投影→复验
 *
 * 恢复 runbook 保序（案 §2.2-R3c）：① 先只读巡检定位漂移面 →② 判因（多系未 bootstrap/异步投影滞后·
 * 非流损坏）→③ 带 `--rebuild` 修复（空流=未 bootstrap 者不在可修列，须先跑对应 bootstrap 成流再来）→
 * ④ 复验绿。回滚窗：本工具无 schema 变更、不动流，修投影=向真相源对齐，无需亦不应「回滚投影到旧错误值」。
 */
import '../apps/api/src/load-env.ts';

import { replaySubscriptionLifecycle } from '@core/saas-kit/modules/subscriptions/domain/subscription-lifecycle-fold';
import { replayTenantLifecycle } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle-fold';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { Event } from '../apps/api/src/database/eventing/entities/event.entity.ts';
import { hydrateEventRows } from '../apps/api/src/database/eventing/event-hydration.ts';
import { initMikroOrm } from '../apps/api/src/database/mikro/mikro-orm.factory.ts';
import { MIKRO_SYS_ENTITIES } from '../apps/api/src/database/mikro/sys-entities.ts';
import { TenantSubscription } from '../apps/api/src/modules/subscriptions/infrastructure/entities/tenant-subscription.entity.ts';
import { Tenant } from '../apps/api/src/modules/tenants/infrastructure/entities/tenant.entity.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[es-projection-doctor] DATABASE_URL missing');
  process.exit(1);
}

const rebuild = process.argv.includes('--rebuild');
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const want = (k: 'tenants' | 'subscriptions') => !onlyArg || onlyArg === k;

interface Drift {
  id: string;
  kind: string;
  detail: string;
  repairable: boolean;
  foldStatus?: string;
}

interface CtxReport {
  name: string;
  total: number;
  drift: Drift[];
}

/** 单上下文只读巡检：投影行逐个 load→fold 与表行对拍·返回漂移清单（含可修性=是否有可回放流）。 */
async function scan(
  em: EntityManager,
  opts: {
    name: string;
    entity: object;
    aggregateType: string;
    bootstrappedType: string;
    replay: (events: ReturnType<typeof hydrateEventRows>) => { status: string } | undefined;
  },
): Promise<CtxReport> {
  const rows = (await em.find(
    opts.entity as never,
    {},
    { orderBy: { id: QueryOrder.ASC } },
  )) as Array<{
    id: string;
    status: string;
  }>;
  const drift: Drift[] = [];
  for (const row of rows) {
    const evRows = await em.find(
      Event,
      { aggregateType: opts.aggregateType, aggregateId: row.id } as never,
      { orderBy: { version: QueryOrder.ASC } },
    );
    const state = opts.replay(hydrateEventRows(evRows));
    const snapshots = evRows.filter((r) => r.eventType === opts.bootstrappedType).length;
    if (!state) {
      drift.push({
        id: row.id,
        kind: opts.name,
        detail: '空流/不可回放（未 bootstrap·非本工具可修）',
        repairable: false,
      });
    } else if (state.status !== row.status) {
      drift.push({
        id: row.id,
        kind: opts.name,
        detail: `fold=${state.status} ⇄ 投影=${row.status} 不符`,
        repairable: true,
        foldStatus: state.status,
      });
    } else if (snapshots !== 1) {
      drift.push({
        id: row.id,
        kind: opts.name,
        detail: `bootstrapped 条数=${snapshots}（应为 1·幂等律破坏·须查 bootstrap 非本工具职责）`,
        repairable: false,
      });
    }
  }
  return { name: opts.name, total: rows.length, drift };
}

/** catch-up 恢复：对可修漂移走 nativeUpdate 回写投影 = fold 结果（镜像 rebuild* 语义·不动流）。 */
async function heal(em: EntityManager, report: CtxReport): Promise<number> {
  let healed = 0;
  for (const d of report.drift) {
    if (!d.repairable || !d.foldStatus) continue;
    const entity = d.kind === 'tenant' ? Tenant : TenantSubscription;
    await em.nativeUpdate(
      entity as never,
      { id: d.id } as never,
      { status: d.foldStatus } as never,
    );
    healed++;
    console.log(`  ↳ rebuild ${d.kind}/${d.id} → 投影回写为真相源态 status=${d.foldStatus}`);
  }
  return healed;
}

const orm = await initMikroOrm(url, MIKRO_SYS_ENTITIES);
const em = orm.em.fork();

async function runScan(): Promise<CtxReport[]> {
  const reports: CtxReport[] = [];
  if (want('tenants')) {
    reports.push(
      await scan(em, {
        name: 'tenant',
        entity: Tenant,
        aggregateType: 'tenant',
        bootstrappedType: 'tenant.bootstrapped',
        replay: (e) => replayTenantLifecycle(e) ?? undefined,
      }),
    );
  }
  if (want('subscriptions')) {
    reports.push(
      await scan(em, {
        name: 'subscription',
        entity: TenantSubscription,
        aggregateType: 'subscription',
        bootstrappedType: 'subscription.bootstrapped',
        replay: (e) => replaySubscriptionLifecycle(e) ?? undefined,
      }),
    );
  }
  return reports;
}

function printReports(reports: CtxReport[]) {
  for (const r of reports) {
    console.log(`[${r.name}] ${r.total - r.drift.length}/${r.total} 行 fold⇄投影一致`);
    for (const d of r.drift) {
      console.log(`  ✗ ${d.id}: ${d.detail}`);
    }
  }
}

try {
  let reports = await runScan();
  printReports(reports);
  const driftCount = reports.reduce((n, r) => n + r.drift.length, 0);

  if (driftCount > 0 && rebuild) {
    let totalHealed = 0;
    for (const r of reports) {
      totalHealed += await heal(em, r);
    }
    console.log(`[doctor] --rebuild 已回写投影 ${totalHealed} 行（真相源对齐·未触 event 流）`);
    console.log('[doctor] 复验——');
    reports = await runScan();
    printReports(reports);
  }

  const residual = reports.reduce((n, r) => n + r.drift.length, 0);
  if (residual > 0) {
    if (driftCount > 0 && !rebuild) {
      console.error(
        `[doctor] FAIL-LOUD——检出 ${residual} 处漂移（只读·未修）；确系投影滞后/漂移可加 --rebuild 修复，空流者须先跑对应 bootstrap。`,
      );
    } else {
      console.error(
        `[doctor] FAIL-LOUD——仍有 ${residual} 处不可由本工具修复（空流/幂等律破坏），须查 bootstrap 面。`,
      );
    }
    process.exit(1);
  }
  console.log('✅ 全上下文 replay fold ⇄ 投影逐字段一致（R3c 滞后检测·catch-up 判据）');
} catch (error) {
  console.error('[es-projection-doctor] failed:', error);
  process.exitCode = 1;
} finally {
  await orm.close();
}

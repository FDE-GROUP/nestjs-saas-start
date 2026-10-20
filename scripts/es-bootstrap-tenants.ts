/**
 * ES R1b —— tenant 存量户籍行成流 bootstrap 入口（module-es-r1-replay-core §3-R1b · 裁②甲）。
 *
 * **高危#1（数据 backfill·写库）**：dev 库经人亲签 2026-10-21；**prod apply 另次亲签**，
 * 本脚本入库不等于生产可跑。核心律（幂等判重/version 续位/zod）在
 * `apps/api/src/database/eventing/bootstrap-tenant-streams.ts`（可注入·镜测+gated 对拍锁）。
 *
 * 用法（前置 `pnpm run build:libs`——`@saas/contracts`/`@core/saas-kit` dist 值导入可解析）：
 *   pnpm exec tsx scripts/es-bootstrap-tenants.ts            # bootstrap（幂等·可安全重跑）
 *   pnpm exec tsx scripts/es-bootstrap-tenants.ts --verify   # 只读对拍：全量 replay fold ⇄ 户籍行
 *
 * 运行器＝`tsx`（沿 `mikro-migrate.ts`/`seed.ts` 先例·R-η：值导入 `.ts` 后缀，Node 原生
 * type-stripping 不解析省略扩展名的相对 ESM 导入）。`--verify` 即案 §5 验收「存量对拍」的
 * 一次性实跑面（常驻化在 `tenant-replay-truth.e2e.test.ts` 段①）：每行流经 `event-hydration`
 * 单源重建 → `replayTenantLifecycle`（最后快照重启语义）→ fold 态必须 === 户籍行 `status`，
 * 且每流恰含 1 条 bootstrapped——不符逐行点名并 exit 1（fail-loud，不带病过门）。
 */
import '../apps/api/src/load-env.ts';

import { replayTenantLifecycle } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle-fold';
import { QueryOrder } from '@mikro-orm/core';
import { bootstrapTenantStreams } from '../apps/api/src/database/eventing/bootstrap-tenant-streams.ts';
import { Event } from '../apps/api/src/database/eventing/entities/event.entity.ts';
import { hydrateEventRows } from '../apps/api/src/database/eventing/event-hydration.ts';
import { initMikroOrm } from '../apps/api/src/database/mikro/mikro-orm.factory.ts';
import { MIKRO_SYS_ENTITIES } from '../apps/api/src/database/mikro/sys-entities.ts';
import { Tenant } from '../apps/api/src/modules/tenants/infrastructure/entities/tenant.entity.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[es-bootstrap] DATABASE_URL missing');
  process.exit(1);
}

const verify = process.argv.includes('--verify');
const orm = await initMikroOrm(url, MIKRO_SYS_ENTITIES);
const em = orm.em.fork();

try {
  if (verify) {
    const tenants = await em.find(Tenant, {}, { orderBy: { id: QueryOrder.ASC } });
    const failures: string[] = [];
    for (const row of tenants) {
      const rows = await em.find(Event, { aggregateType: 'tenant', aggregateId: row.id } as never, {
        orderBy: { version: QueryOrder.ASC },
      });
      const state = replayTenantLifecycle(hydrateEventRows(rows));
      const snapshots = rows.filter((r) => r.eventType === 'tenant.bootstrapped').length;
      if (!state) {
        failures.push(`  - ${row.id}: 空流/不可回放（bootstrap 未落或流损坏）`);
      } else if (state.status !== row.status) {
        failures.push(`  - ${row.id}: fold=${state.status} ⇄ 户籍行=${row.status} 不符`);
      } else if (snapshots !== 1) {
        failures.push(`  - ${row.id}: bootstrapped 条数=${snapshots}（应为 1·幂等律破坏）`);
      }
    }
    console.log(
      `[es-bootstrap] verify: ${tenants.length - failures.length}/${tenants.length} 行对拍通过`,
    );
    if (failures.length > 0) {
      console.error(
        `[es-bootstrap] FAIL-LOUD——fold ⇄ 投影不符 ${failures.length} 行：\n${failures.join('\n')}`,
      );
      process.exit(1);
    }
    console.log('✅ replay fold ⇄ tenant 户籍行全量一致（R1b 验收判据·dev 口径）');
  } else {
    const result = await bootstrapTenantStreams(em);
    console.log(
      `[es-bootstrap] tenant 存量成流：total=${result.total} created=${result.created} skipped=${result.skipped}（幂等可重跑）`,
    );
  }
} catch (error) {
  console.error('[es-bootstrap] failed:', error);
  process.exitCode = 1;
} finally {
  await orm.close();
}

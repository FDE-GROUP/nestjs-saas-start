/**
 * ES R4b —— subscription 存量治理行成流 bootstrap 入口（module-es-r4-second-context-subscriptions §3-R4b · 裁ⓐ甲）。
 *
 * **高危#1（数据 backfill·写库）**：dev 库经人亲签；**prod apply 另次亲签**，本脚本入库不等于生产可跑。
 * 核心律（幂等判重/version 续位/zod）在 `apps/api/src/database/eventing/bootstrap-subscription-streams.ts`
 * （可注入·镜测+gated 对拍锁）。
 *
 * 用法（前置 `pnpm run build:libs`——`@saas/contracts`/`@core/saas-kit` dist 值导入可解析）：
 *   pnpm exec tsx scripts/es-bootstrap-subscriptions.ts            # bootstrap（幂等·可安全重跑）
 *   pnpm exec tsx scripts/es-bootstrap-subscriptions.ts --verify   # 只读对拍：全量 replay fold ⇄ 订阅行
 *
 * 运行器＝`tsx`（沿 `mikro-migrate.ts`/seed 先例·R-η：值导入 `.ts` 后缀）。`--verify` 即案 §6 验收「存量对拍」
 * 的一次性实跑面（常驻化在 gated e2e）：每行流经 `event-hydration` 单源重建 → `replaySubscriptionLifecycle`
 * （最后快照重启语义）→ fold 态必须 === 订阅行 `status`，且每流恰含 1 条 bootstrapped——不符逐行点名并 exit 1
 * （fail-loud，不带病过门）。
 */
import '../apps/api/src/load-env.ts';

import { replaySubscriptionLifecycle } from '@core/saas-kit/modules/subscriptions/domain/subscription-lifecycle-fold';
import { QueryOrder } from '@mikro-orm/core';
import { bootstrapSubscriptionStreams } from '../apps/api/src/database/eventing/bootstrap-subscription-streams.ts';
import { Event } from '../apps/api/src/database/eventing/entities/event.entity.ts';
import { hydrateEventRows } from '../apps/api/src/database/eventing/event-hydration.ts';
import { initMikroOrm } from '../apps/api/src/database/mikro/mikro-orm.factory.ts';
import { MIKRO_SYS_ENTITIES } from '../apps/api/src/database/mikro/sys-entities.ts';
import { TenantSubscription } from '../apps/api/src/modules/subscriptions/infrastructure/entities/tenant-subscription.entity.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[es-bootstrap-subscriptions] DATABASE_URL missing');
  process.exit(1);
}

const verify = process.argv.includes('--verify');
const orm = await initMikroOrm(url, MIKRO_SYS_ENTITIES);
const em = orm.em.fork();

try {
  if (verify) {
    const subs = await em.find(TenantSubscription, {}, { orderBy: { id: QueryOrder.ASC } });
    const failures: string[] = [];
    for (const row of subs) {
      const rows = await em.find(
        Event,
        { aggregateType: 'subscription', aggregateId: row.id } as never,
        { orderBy: { version: QueryOrder.ASC } },
      );
      const state = replaySubscriptionLifecycle(hydrateEventRows(rows));
      const snapshots = rows.filter((r) => r.eventType === 'subscription.bootstrapped').length;
      if (!state) {
        failures.push(`  - ${row.id}: 空流/不可回放（bootstrap 未落或流损坏）`);
      } else if (state.status !== row.status) {
        failures.push(`  - ${row.id}: fold=${state.status} ⇄ 订阅行=${row.status} 不符`);
      } else if (snapshots !== 1) {
        failures.push(`  - ${row.id}: bootstrapped 条数=${snapshots}（应为 1·幂等律破坏）`);
      }
    }
    console.log(
      `[es-bootstrap-subscriptions] verify: ${subs.length - failures.length}/${subs.length} 行对拍通过`,
    );
    if (failures.length > 0) {
      console.error(
        `[es-bootstrap-subscriptions] FAIL-LOUD——fold ⇄ 投影不符 ${failures.length} 行：\n${failures.join('\n')}`,
      );
      process.exit(1);
    }
    console.log('✅ replay fold ⇄ tenant_subscription 行全量一致（R4b 验收判据·dev 口径）');
  } else {
    const result = await bootstrapSubscriptionStreams(em);
    console.log(
      `[es-bootstrap-subscriptions] subscription 存量成流：total=${result.total} created=${result.created} skipped=${result.skipped}（幂等可重跑）`,
    );
  }
} catch (error) {
  console.error('[es-bootstrap-subscriptions] failed:', error);
  process.exitCode = 1;
} finally {
  await orm.close();
}

/**
 * P0 安全缺陷修复第三批 · X8-2 —— 成员物化计数「医生」（`tenant.memberCount` 漂移检测 + reconcile 自愈）。
 *
 * 定位（承接切片 5 遗留缺口）：`MikroQuotaStore.reconcileMembers`（两跳联表实数·经 `organization.tenantId`
 * 归属）文档称「doctor/对拍」却**零落点**——本工具即其消费点。物化列 `tenant.memberCount` 由库级触发器
 * （切片 5 + X8-1 补 UPDATE OF organizationId 支）增量维护；若触发器漏路径/历史脏写/换轴事故致物化 ≠ 联表
 * 真相，席位闸读数即失真（少算侧可 fail-open 超卖）。本工具逐租比对两值、检出漂移，`--rebuild` 时回写为联表真相。
 *
 * **非高危**：零 DDL、不动 member/organization 行、只回写**可重建**物化列 `tenant.memberCount`；缺省**只读**
 * （不带 `--rebuild` 绝不改数据），`--rebuild` 为 opt-in 且幂等（写值恒等于联表实数=真相）。口径与
 * `reconcileMembers` 一致（经 `organization.tenantId` 归属·不依赖 `member.tenantId`）。
 *
 * 用法（前置 `pnpm run build:libs`——`@core/saas-kit` dist 值导入可解析·沿 es-projection-doctor 先例）：
 *   pnpm run doctor:member-count                 # 只读巡检·有漂移 exit 1
 *   pnpm run doctor:member-count -- --rebuild    # 检出漂移→回写物化列为联表真相→复验
 *
 * 骨架镜像 `scripts/es-projection-doctor.ts`，但 scan/heal 导出为可测纯函数、CLI main 以「直接执行才跑」守卫
 * 包裹（沿 `verify-*.ts` 先例），令 gated e2e 可 import 本文件直调 scan/heal 验全链。
 */
import '../apps/api/src/load-env';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntityManager } from '@mikro-orm/core';
import { initMikroOrm } from '../apps/api/src/database/mikro/mikro-orm.factory';
import { MIKRO_SYS_ENTITIES } from '../apps/api/src/database/mikro/sys-entities';
import { Tenant } from '../apps/api/src/modules/organizations/infrastructure/entities/tenant.entity';

/** 单租漂移签名：物化列读数 vs 联表实数（truth=应然值）。 */
export interface MemberCountDrift {
  readonly id: string;
  readonly materialized: number;
  readonly truth: number;
}

/**
 * 只读巡检：单条聚合 SQL 逐租比对物化列 `tenant.memberCount` vs 两跳联表实数，返回**不相等**者。
 * 口径与 `MikroQuotaStore.reconcileMembers` 一致（经 `organization.tenantId` 归属·无租户盖租的 org 不计）。
 */
export async function scanMemberCountDrift(em: EntityManager): Promise<MemberCountDrift[]> {
  const rows = (await em.getConnection().execute(`
    select t."id" as id,
           t."memberCount" as materialized,
           coalesce(sum(mc.c), 0) as truth
    from "tenant" t
    left join (
      select o."tenantId", count(m."id") as c
      from "organization" o
      left join "member" m on m."organizationId" = o."id"
      group by o."tenantId"
    ) mc on mc."tenantId" = t."id"
    group by t."id", t."memberCount"
    having t."memberCount" <> coalesce(sum(mc.c), 0);
  `)) as Array<{ id: string; materialized: number | string; truth: number | string }>;
  return rows.map((r) => ({
    id: String(r.id),
    materialized: Number(r.materialized),
    truth: Number(r.truth),
  }));
}

/**
 * catch-up 自愈：对每条漂移 `nativeUpdate` 回写物化列 = 联表真相（幂等·写值即 truth·不动 member/org 行）。
 * 返回回写行数。
 */
export async function healMemberCountDrift(
  em: EntityManager,
  drift: readonly MemberCountDrift[],
): Promise<number> {
  let healed = 0;
  for (const d of drift) {
    await em.nativeUpdate(Tenant, { id: d.id } as never, { memberCount: d.truth } as never);
    healed++;
    console.log(
      `  ↳ rebuild tenant/${d.id} memberCount: ${d.materialized} → ${d.truth}（联表真相对齐·未触 member/org 行）`,
    );
  }
  return healed;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[member-count-doctor] DATABASE_URL missing');
    process.exit(1);
  }
  const rebuild = process.argv.includes('--rebuild');

  const orm = await initMikroOrm(url, MIKRO_SYS_ENTITIES);
  const em = orm.em.fork();
  try {
    let drift = await scanMemberCountDrift(em);
    if (drift.length === 0) {
      console.log('✅ 全租户 memberCount 物化 ≡ 联表实数（零漂移）');
      return;
    }
    for (const d of drift) {
      console.log(`  ✗ tenant/${d.id}: 物化=${d.materialized} ⇄ 联表=${d.truth} 不符`);
    }
    console.log(`[doctor] 检出 ${drift.length} 处漂移`);

    if (rebuild) {
      const healed = await healMemberCountDrift(em, drift);
      console.log(
        `[doctor] --rebuild 已回写物化列 ${healed} 行（联表真相对齐·未触 member/org 行）`,
      );
      console.log('[doctor] 复验——');
      drift = await scanMemberCountDrift(em);
      if (drift.length === 0) {
        console.log('✅ 复验全租户 memberCount 物化 ≡ 联表实数（零漂移）');
        return;
      }
    }

    if (drift.length > 0) {
      console.error(
        rebuild
          ? `[doctor] FAIL-LOUD——复验仍有 ${drift.length} 处漂移（回写后仍不符·须查触发器/数据）`
          : `[doctor] FAIL-LOUD——检出 ${drift.length} 处漂移（只读·未修）；确系物化漂移可加 --rebuild 回写为联表真相。`,
      );
      process.exit(1);
    }
  } finally {
    await orm.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error('[member-count-doctor] failed:', error);
    process.exitCode = 1;
  });
}

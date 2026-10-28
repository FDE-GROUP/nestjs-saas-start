/**
 * 全栈 CI 拼 PG（[global-ci-fullstack-pg] 切片 A）—— Testcontainers 一次性真库编排器。
 *
 * 流程（审计裁点 甲=Testcontainers·乙=postgres:16-alpine·丁=一容器双库）：
 *   拉起一次性 PG 容器（随机宿主端口，不与在跑 dev 库相撞）
 *   → `createdb` 第二库 `mikro_ba_consistency`（名恒 `auth-adapter.consistency.spec.ts` 的
 *     `assertScratchDb` 安全断言·防误指真实库的原前置原样生效）
 *   → 两库各**重放已提交基线迁移**（`initMigrationOrm` + `migrator.up()`·与 `db:setup` 同路径·
 *     永不 `schema.create/synchronize`，守 tooling §4「generate+migrate」纪律）
 *   → 跑全部已登记 env-gated 真库 e2e（清单恒等校验先行·SSOT=`GATED_E2E_FILES`；`DATABASE_URL`=
 *     `E2E_DATABASE_URL`=ci_e2e 容器串·现契约两变量同指一库）
 *   → 跑 BA authFlow 一致性套件（`DATABASE_URL`=mikro_ba_consistency 串 + `BA_MIKRO_CONSISTENCY=1`）
 *   → `finally` 显式 `container.stop()`——用完即焚、零足迹（§4.10 实跑对拍口径）。
 *
 * Ryuk 不引（镜像境内 pull 风险·plan §3 风险-1）：清理兜底 = finally stop + 启动前按
 * `org.testcontainers.{true,lang=node}` 标签 × 本镜像 × `exited` 清扫遗留（不碰运行中/他人容器）。
 *
 * 运行器 = `tsx`（沿 `mikro-migrate.ts`/`seed.ts` 先例：值导入 `.ts` 后缀迁移装配，
 * Node 原生 type-stripping 不解析省略扩展名的相对 ESM 导入·R-η）。
 * 入口：`pnpm run test:fullstack`（或经 `ci:db`）；**不入默认 `ci`/`ci:quick`/`pre-push`**——
 * 默认 CI 的 DB-free 不变量不动（gated e2e 无 env 时仍 `describe.skip`，本脚本只负责供 env 与库）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const IMAGE = 'postgres:16-alpine';
const E2E_DB = 'ci_e2e';
const CONSISTENCY_DB = 'mikro_ba_consistency';

/** 已登记 env-gated 真库 e2e（`E2E_DATABASE_URL` 开关）——新增 gated 文件时此处同步登记；
 *  实存/清单恒等由下方 `verifyGatedListIdentity` 机制兜底（不再纯靠记性）。
 *  路径订正注记（module-rbac-guard-instance-read 实跑自捕）：tenant-hard-delete/seat-quota-member
 *  早先随 `9eec820` 域归位重构迁居 modules/ 下，本清单未同步→ vitest 对不存在路径静默不跑（漂移敞口）；
 *  workspace-owner-rbac 为 owner-column 片漏登。均按清单自身声明规则补齐，非门禁语义变更。 */
const GATED_E2E_FILES = [
  'apps/api/src/modules/posts/infrastructure/repositories/posts-cursor-pagination.e2e.test.ts',
  'apps/api/src/database/eventing/event-store.mikro.e2e.test.ts',
  'apps/api/src/database/eventing/outbox-relay.e2e.test.ts',
  'apps/api/src/database/mikro/organization-status-subscription-link.e2e.test.ts',
  'apps/api/src/modules/organizations/organization-hard-delete.e2e.test.ts',
  // rehierarchy 片一 治理台改锚 tenant：一租多组织（companion org）连带硬删 + 跨租可见 + suspend 准入权威真库 e2e。
  'apps/api/src/modules/platform/platform-tenants.governance.e2e.test.ts',
  'apps/api/src/modules/users/user-hard-delete.e2e.test.ts',
  'apps/api/src/modules/organizations/organization-table.e2e.test.ts',
  // module-org-odoo-company-mapping 切片 A：绑定列组（unique 双射/CHECK/bind-existing 端口）库语义。
  'apps/api/src/modules/organizations/organization-odoo-binding.e2e.test.ts',
  // module-org-odoo-company-mapping 切片 B：绑定读取端口（published port）按租户解析绑定 + canUseOdoo
  // 裁决矩阵（泄露矩阵的 DB 真相半·喂 RPC 域注入的绑定事实）。
  'apps/api/src/modules/organizations/organization-odoo-binding-reader.e2e.test.ts',
  // module-org-odoo-company-mapping 切片 C：绑定推进端口（published port）provisioning→ready/failed
  // 状态机库语义（saga 赖以推进的写面·与 feature 侧 stub 编排单测合锁「先落意图→回写/失败」全链）。
  'apps/api/src/modules/organizations/organization-odoo-binding-writer.e2e.test.ts',
  'apps/api/src/tenant-isolation/tenant-isolation.e2e.test.ts',
  'apps/api/src/modules/auth/auth-http-surface.e2e.test.ts',
  'apps/api/src/modules/auth/oauth-sso.e2e.test.ts',
  'apps/api/src/modules/auth/session-reclaim.e2e.test.ts',
  // module-mcp-agent-surface 切片 1·凭证闭环四负例真库 e2e（他租拒绝/空 scope 零工具/撤销即时/suspend 联动）。
  // 归位 auth 属主区（features 测试文件深引实体触隔离闸 B·沿「DB 集成测试落归属上下文」先例），
  // 消费面经 MCP_TOKEN_VERIFIER token 解析零 features 路径。
  'apps/api/src/modules/auth/mcp-credentials.e2e.test.ts',
  // module-mcp-agent-surface 切片 2·执行面真库 e2e（真 SDK over 实听 socket 打 /mcp：
  //  scope 可见面/租轴读通/跨租硬地板/越权 401·403/超限）。同归位 auth 属主区（features 零深引·
  //  沿「DB 集成测试落归属上下文」先例·消费面经真 HTTP 全链验鉴权链）。
  'apps/api/src/modules/auth/mcp-agent-surface.e2e.test.ts',
  'apps/api/src/modules/subscriptions/seat-quota-member.e2e.test.ts',
  // X7 切片 G·G1：自助退租撤权撤席真 HTTP+ALS e2e（撤租级两表 + 连清 BA member + live 席位 −1 + 退租者 @Can 403 + last-owner 拒）。
  'apps/api/src/modules/organizations/tenant-member-leave.e2e.test.ts',
  // X7 切片 G·G4：R4 NULL-tenant org 自动 re-parent backfill 迁移真库回放（up 合成专属租+盖 tenantId+补租级成员角色·memberCount 对拍·down 仅撤哨兵合成者可逆）。
  'apps/api/src/database/mikro/migration/backfill-null-tenant-orgs.e2e.test.ts',
  'apps/api/src/modules/subscriptions/subscription-replay-truth.e2e.test.ts',
  'apps/api/src/modules/workspaces/workspace-owner-rbac.e2e.test.ts',
  // X7 切片 C（推翻 D1）：原 grant 组织收窄真库 e2e（`org-scoped-grant.e2e.test.ts`）随组织收窄维废除**整件删除**——
  // grant 现纯租级通配生效，该被测特性已不存在（用例矩阵换轴归切片 F）。
  // 第三次层级复裁 切片 3（D2）·租内跨组织可见性策略真库 e2e：shared 互见·isolated 互不可见·跨租恒不可见·scoped:false 豁免。
  'apps/api/src/tenant-isolation/org-visibility-isolation.e2e.test.ts',
  // 第三次层级复裁 切片 4（D7）·租户激活解绑真库 e2e：设活动租落 activeTenantId+清活动 org·跨租 fail-closed·租级可达不依赖 org。
  'apps/api/src/tenant-isolation/tenant-activation.e2e.test.ts',
  // P0 安全缺陷修复·真 HTTP+ALS 反证 e2e：X1 多租目录含全租 + 切租可达（补 tenant-activation 直调 bus 的证明力错位）·X2 混态租借权读侧 fail-closed 403。
  'apps/api/src/tenant-isolation/p0-lockout-escalation.e2e.test.ts',
  // 叠加层条目（module-odoo-rpc-frontend §4-3·开源边界重划 2026-10-28 后常驻本仓）：features
  // 已纳入 git 追踪·目录恒在，登记随文件恒存——与其他 gated 条目同走双向恒等。
  'apps/api/src/features/odoo-rpc-api/api/odoo-rpc-live.e2e.test.ts',
  // 叠加层条目（module-org-odoo-company-mapping 切片 C）：建司回找活体链（门 ODOO_E2E_BASE_URL·
  // 无联调栈整体 skip）——常驻本仓·随双向恒等闸校验。
  'apps/api/src/features/odoo-provisioning/api/odoo-provisioning-live.e2e.test.ts',
];

// Ryuk 禁用（见头注）；容器清理走 finally stop + 启动前遗留清扫。
process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

/** 豁免名单：具 e2e 命名但非真库 gated 组成员（归属裁定见 module-ci-gated-list-identity-check C1）。 */
const GATED_EXEMPT = [
  // DB-free HTTP 面契约测（probe DTO + 校验链），L1 全量常跑已覆盖，不需 E2E_DATABASE_URL。
  'apps/api/src/i18n/validation-i18n.e2e.test.ts',
];

/**
 * C1 双向恒等校验（人 2026-10-17 令「你定」单点授权裁）：防 GATED_E2E_FILES 登记漂移——
 * 两类已实发无告警先例：① 迁居致清单路径 stale（vitest 对不存在路径静默不跑）；② 新增 gated
 * 文件漏登（全绿假象·单跑绿掩盖「不在链」）。另补豁免腐烂向：豁免条目实存消失亦 fail-loud。
 * 在任何容器开销之前 fail-loud（启动即验·红成本低）。
 */
function verifyGatedListIdentity(): void {
  const rel = (abs: string) => abs.replace(/^\.\//, '');
  // 叠加层已随开源边界重划 2026-10-28 常驻本仓（features 纳入 git 追踪·目录恒在），旧「私有真源
  // 缺席豁免」两态前提消失——所有条目同走 existsSync 双向恒等，不再逐目录特判。
  const stale = GATED_E2E_FILES.filter((p) => !existsSync(p));
  if (stale.length > 0) {
    throw new Error(
      `[ci-fullstack] GATED_E2E_FILES 引用不存在路径（漂移·迁居/stale）：\n  ${stale.join('\n  ')}`,
    );
  }
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.e2e.test.ts')) found.push(rel(p));
    }
  };
  for (const root of ['apps/api/src', 'libs']) walk(root);
  const known = new Set([...GATED_E2E_FILES, ...GATED_EXEMPT]);
  const unregistered = found.filter((p) => !known.has(p));
  if (unregistered.length > 0) {
    throw new Error(
      `[ci-fullstack] 实存 *.e2e.test.ts 未登记进 GATED_E2E_FILES 亦非豁免（漏登脱链·全绿假象）：\n  ${unregistered.join('\n  ')}`,
    );
  }
  const ghostExempt = GATED_EXEMPT.filter((p) => !found.includes(p));
  if (ghostExempt.length > 0) {
    throw new Error(
      `[ci-fullstack] 豁免名单条目已不存在（腐烂·须同步清理）：\n  ${ghostExempt.join('\n  ')}`,
    );
  }
  console.log(
    `[ci-fullstack] gated list identity verified (${GATED_E2E_FILES.length} gated + ${GATED_EXEMPT.length} exempt)`,
  );
}
verifyGatedListIdentity();

function docker(...args: string[]): string {
  const res = spawnSync('docker', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(
      `docker ${args.join(' ')} failed: ${(res.stderr ?? '').trim() || 'unknown error'}`,
    );
  }
  return res.stdout ?? '';
}

// 尽力清扫历史崩溃遗留的一次性容器（仅 testcontainers-node 产物 × 本镜像 × 已退出）；
// docker 不可用时不在此崩——紧随的容器 start 会 fail-loud 点名根因。
try {
  const stale = docker(
    'ps',
    '-aq',
    '--filter',
    'label=org.testcontainers=true',
    '--filter',
    'label=org.testcontainers.lang=node',
    '--filter',
    `ancestor=${IMAGE}`,
    '--filter',
    'status=exited',
  ).trim();
  if (stale) {
    console.log(
      `[ci-fullstack] sweeping stale one-shot containers: ${stale.split('\n').join(' ')}`,
    );
    docker('rm', ...stale.split('\n'));
  }
} catch (err) {
  console.warn(
    `[ci-fullstack] stale sweep skipped (container start will fail-loud if docker missing): ${String(err)}`,
  );
}

let failed = 0;
let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;

try {
  console.log(
    `[ci-fullstack] starting one-shot ${IMAGE} (databases: ${E2E_DB} + ${CONSISTENCY_DB})...`,
  );
  container = await new PostgreSqlContainer(IMAGE)
    .withDatabase(E2E_DB)
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  // 第二库经容器内 unix socket（官方镜像 auth-local=trust）——免密码、免重启容器。
  const createdb = await container.exec(['sh', '-c', `createdb -U postgres ${CONSISTENCY_DB}`]);
  if (createdb.exitCode !== 0) {
    throw new Error(
      `createdb ${CONSISTENCY_DB} failed (exit ${createdb.exitCode}): ${createdb.output?.trim() ?? 'no output'}`,
    );
  }

  const base = `postgres://postgres:postgres@${container.getHost()}:${container.getPort()}`;
  const e2eUrl = `${base}/${E2E_DB}`;
  const consistencyUrl = `${base}/${CONSISTENCY_DB}`;

  for (const url of [e2eUrl, consistencyUrl]) {
    const orm = await initMigrationOrm(url);
    try {
      const applied = await orm.migrator.up();
      console.log(
        `[ci-fullstack] baseline replayed on ${new URL(url).pathname.slice(1)} (${applied.length} migration(s))`,
      );
    } finally {
      await orm.close();
    }
  }

  function run(label: string, args: string[], env: Record<string, string>): number {
    console.log(`\n[ci-fullstack] ▶ ${label}`);
    const res = spawnSync('pnpm', args, { stdio: 'inherit', env: { ...process.env, ...env } });
    const code = res.status ?? 1;
    console.log(`[ci-fullstack] ${code === 0 ? '✓' : '✗'} ${label} (exit ${code})`);
    return code;
  }

  failed |= run('env-gated 全栈 e2e（真容器真库）', ['exec', 'vitest', 'run', ...GATED_E2E_FILES], {
    DATABASE_URL: e2eUrl,
    E2E_DATABASE_URL: e2eUrl,
  });
  failed |= run(
    'BA authFlow 一致性套件（assertScratchDb 库名恒等满足）',
    ['exec', 'vitest', 'run', '--config', 'vitest.consistency.config.ts'],
    {
      DATABASE_URL: consistencyUrl,
      BA_MIKRO_CONSISTENCY: '1',
    },
  );
} finally {
  if (container) {
    await container.stop();
    console.log('[ci-fullstack] one-shot container stopped (零足迹)');
  }
}

process.exit(failed === 0 ? 0 : 1);

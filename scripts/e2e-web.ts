/**
 * 部署态黄金流 E2E 编排器（[global-playwright-browser-e2e] 切片 B）。
 *
 * 一栈到底、用完即焚（仿 `ci-fullstack.ts` PG 编排 + `verify-prod-boot.ts` 起服对拍）：
 *   Testcontainers 一次性 PG → 重放基线迁移 → `db:seed`（可登录运营者 + 唯一成员组织）
 *   → `pnpm run build` 产编译产物 → `node dist/.../main.js` 起 API（轮询 /health 200）
 *   → `vite dev` 起前端 :5173（proxy /api→7009·同源 cookie/CSRF 天然通）→ `playwright test`
 *   → finally：杀 vite/API + stop 容器（零足迹）。
 *
 * 口径=「真起服 + 真浏览器命中」，非「配置就位」（tooling §4.10 实跑对拍）。
 *
 * **opt-in**：入口 `pnpm run test:e2e:web`；**不入默认 `ci`/`ci:quick`/`pre-push`**（守 E2E gate 策略）。
 * 前置：Docker 可用；chromium 二进制已拉（切片 A 已备 `~/.cache/ms-playwright`）。
 * 运行器=`tsx`（值导入 `.ts` 迁移装配·沿 ci-fullstack·R-η）。
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const IMAGE = 'postgres:16-alpine';
const E2E_DB = 'e2e_web';
const API_PORT = process.env.E2E_API_PORT ?? '7009';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5173';
const BASE_URL = `http://localhost:${WEB_PORT}`;
const HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/v1/health`;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'user123';

process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

const log = (m: string) => console.log(`[e2e-web] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ryuk 禁用（镜像境内 pull 风险·沿 ci-fullstack）；启动前按标签 × 本镜像 × exited 清扫遗留一次性容器。
function docker(...args: string[]): string {
  const res = spawnSync('docker', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed: ${(res.stderr ?? '').trim() || 'unknown'}`);
  }
  return res.stdout ?? '';
}
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
  if (stale) docker('rm', ...stale.split('\n'));
} catch (err) {
  log(`stale sweep skipped (container start will fail-loud if docker missing): ${String(err)}`);
}

/** 起一个长驻子进程并挂 exit 记录（stdio inherit 便于现场排障）。 */
function start(label: string, cmd: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  log(`▶ spawn ${label}: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, { stdio: 'inherit', env });
  child.on('exit', (code) => log(`✖ ${label} 进程退出 (code ${code})`));
  return child;
}

/** 轮询 http 至 2xx 或超时；子进程提前退出即 fail-fast。 */
async function waitHealthy(url: string, child: ChildProcess, deadlineMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (child.exitCode !== null) return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // 未就绪：继续轮询。
    }
    await sleep(500);
  }
  return false;
}

let failed = 0;
let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
let apiProc: ChildProcess | undefined;
let webProc: ChildProcess | undefined;

try {
  log(`starting one-shot ${IMAGE} (db ${E2E_DB})...`);
  container = await new PostgreSqlContainer(IMAGE)
    .withDatabase(E2E_DB)
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
  const dbUrl = `postgres://postgres:postgres@${container.getHost()}:${container.getPort()}/${E2E_DB}`;

  const orm = await initMigrationOrm(dbUrl);
  // 迁移快照保真：`migrations.snapshot:true`（与 `db:setup`/`ci-fullstack` 共用的离线迁移装配）会在
  // `migrator.up()` 时按 scratch 库回写 `mikro-migrations.json`（如 timestamp→timestamp(6) 归一），
  // 对**已提交快照**是纯副作用。一次性 PG 只为供 e2e 数据、非产新基线，故 up() 前留存原字节、后原样
  // 回写，保证编排器对**跟踪文件零足迹**（不改共享迁移配置·不影响真实基线生成路径）。
  const snapshotPath = 'apps/api/src/database/mikro/migration/migrations/mikro-migrations.json';
  const snapshotBefore = existsSync(snapshotPath) ? readFileSync(snapshotPath) : null;
  try {
    const applied = await orm.migrator.up();
    log(`baseline replayed (${applied.length} migration(s))`);
  } finally {
    await orm.close();
    if (snapshotBefore && !readFileSync(snapshotPath).equals(snapshotBefore)) {
      writeFileSync(snapshotPath, snapshotBefore);
      log('migration snapshot restored (零足迹)');
    }
  }

  // seed（tsx 直跑源·dotenv 不覆盖显式 DATABASE_URL；非 prod 弱口令兜底放行·仍显式供）。
  const seed = spawnSync('pnpm', ['exec', 'tsx', 'apps/api/src/database/seed.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: dbUrl,
      ADMIN_PASSWORD,
      USER_PASSWORD,
    },
  });
  if ((seed.status ?? 1) !== 0) throw new Error(`db:seed failed (exit ${seed.status})`);
  log('seeded（可登录运营者 + 唯一成员组织）');

  // 编译产物（对拍口径=真起服 dist；E2E_SKIP_BUILD=1 复用既有 dist 加速本地迭代）。
  if (process.env.E2E_SKIP_BUILD !== '1') {
    const build = spawnSync('pnpm', ['run', 'build'], { stdio: 'inherit' });
    if ((build.status ?? 1) !== 0) throw new Error(`build failed (exit ${build.status})`);
    log('build ok');
  } else {
    log('build skipped (E2E_SKIP_BUILD=1)');
  }

  // 起 API（编译产物·DATABASE_URL 覆盖 .env·dotenv/@nestjs-config 不覆盖既有 process.env）。
  apiProc = start('api', process.execPath, ['dist/apps/api/src/main.js'], {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: dbUrl,
    PORT: API_PORT,
  });
  if (!(await waitHealthy(HEALTH_URL, apiProc, 30_000))) {
    throw new Error(`API /health not 200 within 30s (${HEALTH_URL})`);
  }
  log(`API healthy @ ${HEALTH_URL}`);

  // 起前端 vite dev（proxy /api→API·同源免 CORS/CSRF 跨源麻烦）。
  webProc = start('web', 'pnpm', ['--filter', 'web', 'dev'], {
    ...process.env,
    WEB_PROXY_TARGET: `http://localhost:${API_PORT}`,
  });
  if (!(await waitHealthy(BASE_URL, webProc, 30_000))) {
    throw new Error(`vite dev not serving within 30s (${BASE_URL})`);
  }
  log(`web dev healthy @ ${BASE_URL}`);

  const pw = spawnSync('pnpm', ['exec', 'playwright', 'test'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_BASE_URL: BASE_URL,
      E2E_ADMIN_EMAIL: ADMIN_EMAIL,
      E2E_ADMIN_PASSWORD: ADMIN_PASSWORD,
    },
  });
  failed = pw.status ?? 1;
  log(`${failed === 0 ? '✓' : '✗'} playwright test (exit ${failed})`);
} catch (err) {
  log(`💥 ${err instanceof Error ? err.message : String(err)}`);
  failed = 1;
} finally {
  for (const [label, proc] of [
    ['web', webProc],
    ['api', apiProc],
  ] as const) {
    if (proc && proc.exitCode === null && !proc.killed) {
      proc.kill('SIGTERM');
      log(`${label} killed`);
    }
  }
  if (container) {
    await container.stop();
    log('one-shot container stopped (零足迹)');
  }
}

// 兜底：确保子进程随编排器退出而终结（vite/nest 可能吞 SIGTERM）。
function killAll(): void {
  for (const proc of [webProc, apiProc]) {
    if (proc && proc.exitCode === null && !proc.killed) proc.kill('SIGKILL');
  }
}
process.on('exit', killAll);
process.on('SIGINT', () => {
  killAll();
  process.exit(130);
});

process.exit(failed === 0 ? 0 : 1);

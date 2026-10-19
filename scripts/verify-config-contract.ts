// 配置面「四角对拍」独立门禁——把 config 片（module-config-env-surface-contract）§4.6 钉死的人工对拍
// 口径固化为可复算脚本（plan module-config-seed-fail-loud-and-contract-gate 切片 F·人裁②执行）。
//
// 三判据（全部**静态声明面**校验，与 compose 门禁 verify-compose-contract 互补不互替）：
//   ① 样例生效键 ⊆（Joi schema 键 ∪ 代码读取键）→ 无死配置（声明有、实现无持有）；
//   ② 代码读取键 ⊆（样例生效 ∪ 样例注释态 ∪ 显式白名单）→ 无隐藏必需项；
//   ③ schema 必填键（zod 语义：无 optional/default）全部出现在 docker-compose.yml 的 services.app.environment → D4 已闭合判据不回潮。
//
// 口径硬约束（config 片 §1 教训的制度化）：代码读取集必须双模式扫描——`process.env` 点属性直读
// 与 config 服务 `get('键名')` 字面量取键——只扫其一会重演 MAIL_* 型假阳性与 F8 型陈旧账。
// （本段刻意不写这两种模式的字面形：本脚本自身在扫描面内，示例即毒例——首轮实跑已自捕。）
// 扫描范围钉死 `apps/**` + `libs/**` + `scripts/**`（排除 node_modules/dist/.git/*.test.ts/*.d.ts）。
// Joi 键取 `config.module.ts` 源内 `baseSchema` 块静态解析：`createSchemaForEnv` 未导出，
// 为门禁改源码导出属行为面变更，故口径写死在本脚本供后人复算（config 片 §4.6 同风）。
// 白名单初始集 = config 片 §4.6 已甄别的 `scripts/` 面三键（脚本从不装载 .env，上图即制造 F3 同型缺陷）。
//
// 独立命令、**不进 `ci` 链**（人裁②·零门禁行为变更）。触发：`pnpm run verify:config-contract`。
// 运行时=Node 原生 type-stripping：仅用 node: 内置 + js-yaml（既有依赖），零新增第三方、不依赖 dist。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { load } from 'js-yaml';

const ENV_FILE = '.env';
const ENV_EXAMPLE_FILE = '.env.example';
const COMPOSE_FILE = 'docker-compose.yml';
const CONFIG_MODULE_FILE = 'apps/api/src/config/config.module.ts';
const CODE_DIRS = ['apps', 'libs', 'scripts'];

/** 显式白名单（刻意不上图的进程 env 键·config 片 §4.6 「scripts/ 面三键等」甄别在案）：
 * 四个 verify/ci 脚本与 ci-fullstack 均不装载 dotenv，写进样例即制造 F3 同型「声明有、实现无持有」。
 * 同口径亦涵盖**前端 dev-only 覆盖键**（如 `WEB_PROXY_TARGET`·vite dev 反代目标·带硬编码兜底
 * `http://localhost:7009`·从不需为启动而设·非部署契约）——纳管见 module-config-web-dev-proxy-key。 */
const WHITELIST = new Set([
  'NO_COLOR',
  'VERIFY_PORT',
  'VERIFY_TIMEOUT_MS',
  'TESTCONTAINERS_RYUK_DISABLED',
  'WEB_PROXY_TARGET',
]);

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (color ? code : '');
const GREEN = wrap('\x1b[32m');
const RED = wrap('\x1b[31m');
const DIM = wrap('\x1b[2m');
const BOLD = wrap('\x1b[1m');
const RST = wrap('\x1b[0m');

const failures: string[] = [];
const ok = (msg: string) => console.log(`${GREEN}✓${RST} ${msg}`);
const bad = (msg: string) => {
  console.log(`${RED}✗ ${msg}${RST}`);
  failures.push(msg);
};

// ── 代码读取键：双模式扫描（口径钉死，勿单模式回潮） ────────────────────────────
const DIRECT_READ_RE = /process\.env\.(?:\?\.)?([A-Z][A-Z0-9_]*)/g;
const GETTER_READ_RE =
  /(?:configService|this\.config|(?<![\w.])config)\s*(?:\?\.)?\.get\s*(?:<[^()]*>)?\s*\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g;

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) collectTsFiles(p, out);
    else if (p.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(p) && !p.endsWith('.d.ts'))
      out.push(p);
  }
  return out;
}

const codeKeys = new Set<string>();
const codeKeyOrigin = new Map<string, string>();
for (const dir of CODE_DIRS) {
  for (const file of collectTsFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const re of [DIRECT_READ_RE, GETTER_READ_RE]) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m !== null; m = re.exec(text)) {
        if (!codeKeys.has(m[1])) codeKeyOrigin.set(m[1], file);
        codeKeys.add(m[1]);
      }
    }
  }
}

// ── 样例 / 实配文件：生效与注释态两集（config 片 §4.3 教训：混计会错报集合归属） ──
function parseEnvKeys(file: string, text: string) {
  const active = new Set<string>();
  const commented = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const a = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (a) active.add(a[1]);
    const c = /^#\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (c) commented.add(c[1]);
  }
  if (active.size === 0 && commented.size === 0) {
    throw new Error(`${file} 未解析出任何键（文件形态走样？拒绝在空集合上判「通过」）`);
  }
  return { active, commented };
}

const example = parseEnvKeys(ENV_EXAMPLE_FILE, readFileSync(ENV_EXAMPLE_FILE, 'utf8'));
const realEnv = parseEnvKeys(ENV_FILE, readFileSync(ENV_FILE, 'utf8'));

// ── schema 键与 required 集：baseSchema 块行级静态解析（S2 换轨 zod·键解析口径不变） ──
const schemaText = readFileSync(CONFIG_MODULE_FILE, 'utf8');
const blockStart = schemaText.indexOf('const baseSchema = {');
const blockEnd = schemaText.indexOf('const betterAuthSchema');
if (blockStart < 0 || blockEnd < 0 || blockEnd < blockStart) {
  throw new Error(
    `${CONFIG_MODULE_FILE} 找不到 baseSchema/betterAuthSchema 边界（结构走样，口径需人工同步）`,
  );
}
const joiKeys = new Set<string>();
const joiRequiredKeys = new Set<string>();
{
  const lines = schemaText.slice(blockStart, blockEnd).split(/\r?\n/);
  let current: string | null = null;
  let chunk = '';
  const flush = () => {
    // zod 语义推断必需键：无 `.optional(` 且无 `.default(` 即必填（等价旧 Joi `.required()`·判据③强度不降）。
    if (current && !/\.optional\(/.test(chunk) && !/\.default\(/.test(chunk))
      joiRequiredKeys.add(current);
  };
  for (const line of lines) {
    const keyMatch = /^ {4}([A-Z][A-Z0-9_]*):\s*(.*)$/.exec(line);
    if (keyMatch) {
      flush();
      current = keyMatch[1];
      chunk = keyMatch[2];
      joiKeys.add(current);
    } else if (current) {
      chunk += line;
    }
  }
  flush();
}
if (joiKeys.size < 20) {
  throw new Error(`Joi 键解析数 ${joiKeys.size} 异常偏低（解析口径与源码漂移？拒绝带病判卷）`);
}

// ── compose services.app.environment 键集（list/map 两形态统一） ─────────────────
type ComposeShape = {
  services?: Record<string, { environment?: string[] | Record<string, string> } | undefined>;
};
const compose = load(readFileSync(COMPOSE_FILE, 'utf8')) as ComposeShape;
const rawEnv = compose.services?.app?.environment;
if (!rawEnv) throw new Error(`${COMPOSE_FILE} 缺 services.app.environment`);
const composeKeys = new Set<string>(
  Array.isArray(rawEnv)
    ? rawEnv
        .map((entry) => entry.slice(0, entry.indexOf('=')))
        .filter((k) => /^[A-Z][A-Z0-9_]*$/.test(k))
    : Object.keys(rawEnv),
);

// ── 三判据 ────────────────────────────────────────────────────────────────────
console.log(`${BOLD}── Verify config contract (four-corner static check) ──${RST}`);

const deadInExample = [...example.active].filter((k) => !joiKeys.has(k) && !codeKeys.has(k));
if (deadInExample.length === 0)
  ok(`判据① 样例生效键 ⊆（Joi ∪ 代码读取）·无死配置（${example.active.size} 键全有持有）`);
else bad(`判据① 死配置（样例声明、无人消费）: ${deadInExample.join(', ')}`);

const declaredSet = new Set([...example.active, ...example.commented]);
const hiddenRequired = [...codeKeys].filter((k) => !declaredSet.has(k) && !WHITELIST.has(k));
if (hiddenRequired.length === 0)
  ok(
    `判据② 代码读取键 ⊆（样例 ∪ 白名单）·无隐藏必需项（${codeKeys.size} 键·白名单 ${WHITELIST.size} 项）`,
  );
else
  bad(
    `判据② 代码读取但样例/白名单皆未声明: ${hiddenRequired.map((k) => `${k}@${codeKeyOrigin.get(k)}`).join(', ')}`,
  );

const missingInCompose = [...joiRequiredKeys].filter((k) => !composeKeys.has(k));
if (missingInCompose.length === 0)
  ok(
    `判据③ 必填键（无 optional/default）⊆ compose app environment（${joiRequiredKeys.size} 键全在编排·D4 不回潮）`,
  );
else bad(`判据③ required 键未上编排: ${missingInCompose.join(', ')}`);

// ── 四组集合存照（可复核·config 片 §4-1 口径） ──────────────────────────────────
const bothLive = [...codeKeys].filter((k) => declaredSet.has(k)).length;
const onlyExample = [...example.active].filter((k) => !codeKeys.has(k) && !joiKeys.has(k));
const onlyRealEnv = [...realEnv.active].filter((k) => !declaredSet.has(k));
console.log(
  `${DIM}存照: 代码读取 ${codeKeys.size} · 样例生效 ${example.active.size}/注释态 ${example.commented.size} · ` +
    `Joi ${joiKeys.size}(required ${joiRequiredKeys.size}) · compose ${composeKeys.size} · .env 生效 ${realEnv.active.size}`,
);
console.log(
  `${DIM}四角: 两皆 ${bothLive} | 仅样例(死配置) ${onlyExample.length || '-'} | ` +
    `代码读样例白名单皆无 ${hiddenRequired.length || '-'} | 仅开发机 .env ${onlyRealEnv.length ? onlyRealEnv.join(',') : '-'}`,
);

if (failures.length > 0) {
  console.log(`${RED}${BOLD}FAILED${RST} (${failures.length})`);
  process.exit(1);
}
console.log(`${GREEN}${BOLD}PASSED${RST}`);

// 类型逃逸「只紧不扫」棘轮门禁（module-common-type-escape-ratchet）。
//
// 目的：把当前生产手写码的类型逃逸（`as any` / `as never` / `: any` / `<any>`）存量固化为
// 基线单源（`scripts/type-escape-baseline.json`），此后**只拦新增**——任一文件命中数超过其基线
// 即 fail；下降仅提示（v1 advisory）。是「不盲扫存量、只防债增长并逐步收敛」的机制护栏。
//
// 口径与取证一致：扫 `apps/**` + `libs/**` 下 `.ts`，排除 node_modules / dist / *.test.ts /
// *.spec.ts / *.gen.ts / *.d.ts（生成物、产物、测试不计）。逐行布尔命中（与 `grep -c` 同口径）。
//
// 用法：
//   node scripts/verify-type-escape-ratchet.ts            检查（越界→exit 1）
//   node scripts/verify-type-escape-ratchet.ts --update   以当前实测重生成基线（正当新逃逸/收敛后经此落库·git diff 可审）
//   --strict-lower：低于基线也强制要求同步下调（否则 fail）；v1 默认关闭。

import { readdirSync, readFileSync, type Stats, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const SCAN_ROOTS = ['apps', 'libs'];
const BASELINE_REL = 'scripts/type-escape-baseline.json';

// 逐行命中判据（no-global test）：与取证 grep 的 `:\s*any\b|as any\b|<any>|\bas never\b` 同口径。
const ESCAPE_RE = /:\s*any\b|as any\b|<any>|\bas never\b/;

/** 是否跳过该相对路径（产物/生成物/测试不计）。 */
export function shouldScan(relPath: string): boolean {
  const p = relPath.split('\\').join('/');
  if (!p.endsWith('.ts')) return false;
  if (p.includes('/node_modules/') || p.startsWith('node_modules/')) return false;
  if (p.includes('/dist/') || p.startsWith('dist/')) return false;
  if (/\.(test|spec|gen)\.ts$/.test(p)) return false;
  if (p.endsWith('.d.ts')) return false;
  return true;
}

/** 递归收集某根目录下应扫描的 .ts 相对路径。 */
function walk(absDir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(absDir, name);
    const rel = relative(REPO_ROOT, abs).split('\\').join('/');
    let st: Stats | undefined;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // 早剪：跳过明显不需进入的目录。
      if (name === 'node_modules' || name === 'dist') continue;
      walk(abs, acc);
    } else if (shouldScan(rel)) {
      acc.push(rel);
    }
  }
}

/** 计算每个文件的类型逃逸命中行数（仅含 count>0 者）。 */
export function computeCounts(): Record<string, number> {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  const counts: Record<string, number> = {};
  for (const rel of files) {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    let n = 0;
    for (const line of text.split('\n')) {
      if (ESCAPE_RE.test(line)) n++;
    }
    if (n > 0) counts[rel] = n;
  }
  return counts;
}

export type Verdict = {
  violations: { file: string; current: number; baseline: number }[];
  opportunities: { file: string; current: number; baseline: number }[];
  staleBaseline: string[];
};

/** 纯判定：越界（超基线·含基线外新文件）入 violations；低于基线入 opportunities；基线项已消失入 stale。 */
export function evaluate(
  current: Record<string, number>,
  baseline: Record<string, number>,
): Verdict {
  const violations: Verdict['violations'] = [];
  const opportunities: Verdict['opportunities'] = [];
  for (const [file, cur] of Object.entries(current)) {
    const base = baseline[file] ?? 0;
    if (cur > base) violations.push({ file, current: cur, baseline: base });
    else if (cur < base) opportunities.push({ file, current: cur, baseline: base });
  }
  const staleBaseline = Object.keys(baseline).filter((f) => !(f in current) && baseline[f] > 0);
  return { violations, opportunities, staleBaseline };
}

function readBaseline(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(join(REPO_ROOT, BASELINE_REL), 'utf8')) as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

function total(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

function main(argv: string[]): void {
  const current = computeCounts();
  const curTotal = total(current);

  if (argv.includes('--update')) {
    const sorted: Record<string, number> = {};
    for (const k of Object.keys(current).sort()) sorted[k] = current[k];
    writeFileSync(join(REPO_ROOT, BASELINE_REL), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
    console.log(
      `✓ 基线已更新：${Object.keys(sorted).length} 文件 · ${curTotal} 处 → ${BASELINE_REL}`,
    );
    return;
  }

  const baseline = readBaseline();
  const { violations, opportunities, staleBaseline } = evaluate(current, baseline);
  const strictLower = argv.includes('--strict-lower');

  if (violations.length > 0) {
    console.log('✗ 类型逃逸越界（新增·超基线）：');
    for (const v of violations.sort((a, b) => b.current - b.baseline - (a.current - a.baseline))) {
      const tag = v.baseline === 0 ? '基线外新文件' : `+${v.current - v.baseline}`;
      console.log(`  - ${v.file}: 当前 ${v.current} / 基线 ${v.baseline}（${tag}）`);
    }
    console.log(
      '\n  若确系正当三方逃逸（MikroORM/BA/Fastify 胶水），经 `pnpm run verify:type-escape:update` 落基线并随 PR 人审。',
    );
    process.exit(1);
  }

  if (strictLower && opportunities.length > 0) {
    console.log('✗ --strict-lower：存在低于基线的收敛未同步下调：');
    for (const o of opportunities)
      console.log(
        `  - ${o.file}: 当前 ${o.current} / 基线 ${o.baseline}（可降 ${o.baseline - o.current}）`,
      );
    process.exit(1);
  }

  const okMsg =
    opportunities.length > 0 || staleBaseline.length > 0
      ? `（提示：${opportunities.length} 文件可下调基线${staleBaseline.length ? ` · ${staleBaseline.length} 基线项已消失` : ''}·下次 ` +
        '`pnpm run verify:type-escape:update` 棘轮下调）'
      : '';
  console.log(
    `✓ 类型逃逸棘轮通过：当前 ${Object.keys(current).length} 文件 · ${curTotal} 处（= 基线·未越界）${okMsg}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}

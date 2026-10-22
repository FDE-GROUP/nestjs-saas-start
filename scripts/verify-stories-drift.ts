// stories-drift「恒等闸」（新增 CI 门禁 · 高危 · 经人签核）。
//
// 目的：把 docs/stories 的溯源纪律「只指文件名/方法名（防漂移）」从「人工自觉 + 代码评审」升格为
// **机制强制**——故事引用的仓内产物（关联 plan / `.ts` 文件名 / wire 错误码 / class-suffix 符号）若因重命名、目录搬迁、
// 删除而断链 → fail-loud（exit 1）。防「讲解性 as-built 文档静默指向已不存在之物」（README 记本仓历经
// 数轮 src→apps/reference→apps/api 搬迁，唯 stories 面无恒等闸·此闸补位）。
//
// 诚实边界（不可机器化·明写不覆盖）：本闸只锁「引用产物实存性」这一**机械 drift** 类；**不校验语义/
// 散文正确性**（如故事写「路由返 201」而代码已改 200）——那属人评职责（as-built 描述的现状对不对·静态
// 闸无从判定）。档 D 符号档同此理：只断言类名实存，不校验方法名/所有权（`Xxx.foo` 仅验 `Xxx`·承档 B
// basename 粗粒度）。四档皆取仓内明确产物、当前基线全绿（28 plan / 42 .ts / 2 wire 码 / 33 符号）。
//
// 边界（防误红）：只解析 docs/stories/*.md 反引号内**严格形如** `.ts` 文件名 / `NS:NAME` wire 码 /
// **后缀锚定** class-suffix 符号（PascalCase 且以 Controller|Command|…|Event 收尾·剥离 `.method` 尾）的 token，
// 及 `../plans/*.md` 链接；路由串、目录路径、小写点分事件名、全大写常量（`TRANSITIONS`）、缩写（`PIPL`/`FK`）、
// 含空格代码片段皆因不符 `^…$`/后缀锚而跳过。元示例占位符 `NAMESPACE:NAME` 列入 allow-list 豁免；
// 符号档留 `SYMBOL_ALLOWLIST`（外部库同名类·当前空）供未来扩。
//
// 用法：node scripts/verify-stories-drift.ts            检查（断链→exit 1）

import { readdirSync, readFileSync, type Stats, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const STORIES_DIR = join(REPO_ROOT, 'docs/stories');
const PLANS_DIR = join(REPO_ROOT, 'docs/plans');
const ERROR_CODES_FILE = join(REPO_ROOT, 'libs/core/src/shared-kernel/errors/error-codes.ts');
// 溯源引用的代码检索域（排 node_modules/dist 等产物·承「引用的是源文件」判据）。
const SOURCE_ROOTS = ['apps', 'libs', 'packages'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.tanstack', 'coverage', '.next', 'build']);

// wire 码元示例占位符（讲解 `NAMESPACE:NAME` 文法·非指向真实码）——豁免不判。
export const WIRE_CODE_ALLOWLIST = new Set(['NAMESPACE:NAME']);

// 档 D 符号后缀锚（承本仓 CQRS/DDD 惯例：这些角色后缀恒为 class/interface 声明·故反引号内
// 以此收尾者即「代码符号引用」·排除全大写常量/缩写等散文 token）。
export const SYMBOL_SUFFIXES = [
  'Controller',
  'Command',
  'CommandHandler',
  'Service',
  'Repository',
  'Guard',
  'Handler',
  'Event',
] as const;
// 外部库同名类豁免（当前空·留扩）。
export const SYMBOL_ALLOWLIST = new Set<string>();

/**
 * 纯核（可单测）：从 markdown 全文提取四类溯源引用产物（去重·保持首次出现序）。
 * - planLinks：所有 `../plans/<name>.md` 链接目标
 * - tsFiles：反引号内形如 `path/to/x.ts` 的文件名（取 basename）
 * - wireCodes：反引号内形如 `NS:NAME` 的 wire 错误码
 * - symbols：反引号内 PascalCase 且以 SYMBOL_SUFFIXES 收尾的类名（`Xxx.method` 剥 .method 取 Xxx）
 * 路由串/目录/全大写常量/缩写/含空格代码片段因不匹配锚自然落除。
 */
export function extractStoryRefs(md: string): {
  planLinks: string[];
  tsFiles: string[];
  wireCodes: string[];
  symbols: string[];
} {
  const planLinks = [...md.matchAll(/\.\.\/plans\/([A-Za-z0-9_-]+\.md)/g)].map((m) => m[1]);

  const tsFiles: string[] = [];
  const wireCodes: string[] = [];
  const symbols: string[] = [];
  for (const token of md.matchAll(/`([^`]+)`/g)) {
    const t = token[1].trim();
    if (/^[A-Za-z0-9._/-]+\.ts$/.test(t)) {
      tsFiles.push(t.split('/').pop() as string);
      continue;
    }
    if (/^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/.test(t)) {
      wireCodes.push(t);
      continue;
    }
    const base = t.split('.')[0] as string;
    if (/^[A-Z][A-Za-z0-9]*$/.test(base) && SYMBOL_SUFFIXES.some((s) => base.endsWith(s)))
      symbols.push(base);
  }

  return {
    planLinks: [...new Set(planLinks)],
    tsFiles: [...new Set(tsFiles)],
    wireCodes: [...new Set(wireCodes)],
    symbols: [...new Set(symbols)],
  };
}

/** 纯核：引用集里不在「已知实存集」（且非豁免）者 → 断链清单。 */
export function findMissing(
  refs: Iterable<string>,
  known: Set<string>,
  allowlist: ReadonlySet<string> = WIRE_CODE_ALLOWLIST,
): string[] {
  return [...new Set(refs)].filter((r) => !known.has(r) && !allowlist.has(r));
}

/**
 * 单遍源树 walk：收集检索域内全部 `.ts` basename，并顺带读每文件抽 `class|interface` 声明名入符号索引
 * （档 D 用·排 SKIP_DIRS·读数百小文件·域内亚秒级）。
 */
function collectSourceIndex(): { tsFiles: Set<string>; symbols: Set<string> } {
  const tsFiles = new Set<string>();
  const symbols = new Set<string>();
  const walk = (cur: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = join(cur, name);
      let st: Stats;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!name.endsWith('.ts')) continue;
      tsFiles.add(name);
      try {
        const src = readFileSync(abs, 'utf8');
        for (const m of src.matchAll(/\b(?:class|interface)\s+([A-Za-z0-9_]+)/g))
          symbols.add(m[1] as string);
      } catch {
        /* 读失败仅跳过符号抽取·basename 仍已入集 */
      }
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(REPO_ROOT, root));
  return { tsFiles, symbols };
}

/** 直读 error-codes 活文件解析全部码值（单源·不落副本·防 enforcement 副本自身漂移）。 */
function collectWireCodeValues(): Set<string> {
  const src = readFileSync(ERROR_CODES_FILE, 'utf8');
  return new Set([...src.matchAll(/'([A-Z][A-Z0-9_]*:[A-Z0-9_:]+)'/g)].map((m) => m[1]));
}

function main(): void {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const wrap = (code: string) => (color ? code : '');
  const GREEN = wrap('\x1b[32m');
  const RED = wrap('\x1b[31m');
  const BOLD = wrap('\x1b[1m');
  const RST = wrap('\x1b[0m');

  console.log(`${BOLD}── Verify stories traceability drift ──${RST}`);

  let storyFiles: string[];
  try {
    storyFiles = readdirSync(STORIES_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    console.log(`${RED}${BOLD}stories-drift FAILED${RST} — 找不到 docs/stories`);
    process.exit(1);
  }

  const existingPlans = new Set(readdirSync(PLANS_DIR).filter((f) => f.endsWith('.md')));
  const sourceIndex = collectSourceIndex();
  const knownCodes = collectWireCodeValues();

  const agg = {
    planLinks: new Set<string>(),
    tsFiles: new Set<string>(),
    wireCodes: new Set<string>(),
    symbols: new Set<string>(),
  };
  for (const f of storyFiles.sort()) {
    const refs = extractStoryRefs(readFileSync(join(STORIES_DIR, f), 'utf8'));
    for (const p of refs.planLinks) agg.planLinks.add(p);
    for (const t of refs.tsFiles) agg.tsFiles.add(t);
    for (const c of refs.wireCodes) agg.wireCodes.add(c);
    for (const s of refs.symbols) agg.symbols.add(s);
  }

  const brokenPlans = findMissing(agg.planLinks, existingPlans);
  const missingTs = findMissing(agg.tsFiles, sourceIndex.tsFiles);
  const unknownCodes = findMissing(agg.wireCodes, knownCodes);
  const missingSymbols = findMissing(agg.symbols, sourceIndex.symbols, SYMBOL_ALLOWLIST);
  const checkedCodes = [...agg.wireCodes].filter((c) => !WIRE_CODE_ALLOWLIST.has(c)).length;

  const total = agg.planLinks.size + agg.tsFiles.size + checkedCodes + agg.symbols.size;

  if (brokenPlans.length + missingTs.length + unknownCodes.length + missingSymbols.length > 0) {
    console.log(`${RED}✗ 溯源引用断链（引用产物在仓内查无）：${RST}`);
    for (const p of brokenPlans) console.log(`  - [plan 链接] ../plans/${p}`);
    for (const t of missingTs) console.log(`  - [.ts 文件名] ${t}`);
    for (const c of unknownCodes) console.log(`  - [wire 码] ${c}（不在 ERROR_CODES）`);
    for (const s of missingSymbols) console.log(`  - [符号] ${s}（无 class/interface 声明）`);
    console.log(
      `\n  依据 docs/stories/README.md 溯源纪律「只指文件名/方法名（防漂移）」：` +
        `故事引用的 plan/文件/码/符号须随重命名·搬迁·删除同步订正。`,
    );
    process.exit(1);
  }

  console.log(
    `${GREEN}${BOLD}stories-drift PASSED${RST} — ${storyFiles.length} 文件 · ` +
      `${agg.planLinks.size} plan 链接 / ${agg.tsFiles.size} .ts 文件名 / ` +
      `${checkedCodes} wire 码 / ${agg.symbols.size} 符号 全部解析（${total} 项·零断链）`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}

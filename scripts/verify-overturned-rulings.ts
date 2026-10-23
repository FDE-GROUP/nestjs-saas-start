// 「已推翻裁定」注释同步恒等闸（新增 CI 门禁 · 高危 · 经人签核 2026-10-23）。
//
// 目的：把「决策被反悔后，代码注释散文须随翻」从「人工自觉 + 代码评审」升格为**机制强制**。
// 某 plan 被后继 plan 推翻（overturn）后，`specs/glossary/plans` 会翻账，但散落在核心域文件头注的
// **失实现态断言**（如「状态存 `tenant.status` 真列」「走 `tenant` 户籍表单点写回」）易落后一代决策——
// 本案 global-organization-status-comment-sync 人肉清零 8+9 段，此闸固化其机制、堵 residual-cleanup
// 明示排除「注释散文」留下的覆盖缺口（stories-drift 只锁 docs/stories 产物实存性、不覆盖代码注释）。
//
// 判据：内置「已推翻裁定登记表」OVERTURNED_RULINGS，扫**代码注释**（不含字符串字面量）——某注释单元
// 命中 `bannedToken` 且**该注释单元内不含**任一 `framingMarker`（历史框定词）→ fail-loud。框定豁免按
// **注释块**（多行块注释 = 一个语义散文单元）判定，非按物理行（承 bootstrapped 事件 token 与框定词跨行实证）。
//
// 诚实边界（不可机器化·明写不覆盖）：① 只拦**登记表点名**的 token，非通用语义检查（未登记的反悔不抓·须
// 随案补登）；② 框定豁免是启发式，失实行恰含框定词（假阴）会放行——取「防误红优先」换零假阳性可进
// full/quick；③ 只解析注释、跳过字符串——故 wire 值 `'tenant.status.transitioned'` 在代码中绝不入判，
// 注释内**事件名指称**亦因 token 正则负向前瞻 `(?!\.transitioned)` 放行（双重防误杀冻结契约）。
//
// 用法：node scripts/verify-overturned-rulings.ts            检查（失实断言→exit 1）

import { readdirSync, readFileSync, type Stats, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
// 扫描域（后端源码·承「注释居代码侧」判据）。
const SOURCE_ROOTS = ['libs/core/src', 'libs/contracts/src', 'apps/api/src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.tanstack', 'coverage', '.next', 'build']);

export interface OverturnedRuling {
  /** 被推翻的裁定 plan 短名（违规回显·供追溯）。 */
  readonly plan: string;
  /** 推翻它的后继 plan 短名。 */
  readonly supersededBy: string;
  /** 该裁定曾确立、现应禁于「非历史」代码注释的失实 token（正则·无 /g·大小写敏感）。 */
  readonly bannedTokens: readonly RegExp[];
  /** 反证框定词：注释单元含任一者视为「合法历史叙述」→ 整单元豁免不判。 */
  readonly framingMarkers: readonly string[];
}

/**
 * 已推翻裁定登记表（enforcement 副本·随案生长·非宪法·宪法挂钩另案见 plan §5）。
 * 每条皆锚 2026-10-23 有据实证（非臆造）：token 与 markers 均按当前工作树清零后实况配平。
 */
export const OVERTURNED_RULINGS: readonly OverturnedRuling[] = [
  {
    // 治理态存储：寄居 metadata → 自有 `tenant` 旁表（reclamation·已反悔）→ `organization.status` 真列（consolidation）。
    plan: 'global-tenant-entity-reclamation',
    supersededBy: 'global-governance-lifecycle-consolidation',
    bannedTokens: [/tenant\.status\b(?!\.transitioned)/, /户籍/],
    framingMarkers: [
      '原',
      '旧',
      '首用',
      '当时',
      '成流时',
      '归位',
      'DROP',
      '退场',
      '寄居',
      '反悔',
      '历史',
      '已撤',
      '修订',
      '旁表',
      '旁列',
    ],
  },
  {
    // 业务实体词汇：tenant 双词汇（userfacing-tenant-naming·已反悔）→ organization 全栈统一（vocabulary-pivot）。
    plan: 'global-userfacing-tenant-naming',
    supersededBy: 'global-organization-vocabulary-pivot',
    bannedTokens: [/自有 tenant 表/],
    framingMarkers: ['早期', '后续', '均已', '修订', '原', '已', '归位', '反悔', '历史'],
  },
];

export interface CommentUnit {
  /** 注释内容原文（不含 `//`·`/*`·`*\/` 定界符·多行块注释含内部换行）。 */
  readonly text: string;
  /** 该注释单元起始物理行（1-based·供违规定位回显）。 */
  readonly startLine: number;
}

/**
 * 纯核（可单测）：手写词法扫描抽 TS 源里全部注释单元，**跳过字符串/模板字面量**（防误判 wire 值）。
 * 状态机：normal → (`//` 行注释到 EOL | `/*` 块注释到 `*\/`) | (`' " \`` 字符串跳过至闭合·认反斜杠转义)。
 * 取舍：不解析正则字面量/模板 `${}` 内嵌表达式（罕见冲突·诚实边界 §3）。
 */
export function extractCommentUnits(src: string): CommentUnit[] {
  const units: CommentUnit[] = [];
  let line = 1;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i] as string;
    const c2 = src[i + 1] as string;
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      let buf = '';
      while (j < n && src[j] !== '\n') {
        buf += src[j];
        j++;
      }
      units.push({ text: buf, startLine: line });
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let j = i + 2;
      let buf = '';
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) {
        if (src[j] === '\n') line++;
        buf += src[j];
        j++;
      }
      units.push({ text: buf, startLine: line });
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '\n') line++;
        if (src[j] === quote) break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === '\n') line++;
    i++;
  }
  return units;
}

/**
 * 纯核（可单测）：给定文件相对路径 + 注释单元，返回失实断言违规清单。
 * 判据 = 单元内某 bannedToken 命中，且该单元**不含**同条任一 framingMarker（按整块豁免）。
 * 回显定位行 = 单元内首个命中 token 的物理行。
 */
export function findViolations(
  file: string,
  units: readonly CommentUnit[],
  rulings: readonly OverturnedRuling[] = OVERTURNED_RULINGS,
): { file: string; line: number; plan: string; snippet: string }[] {
  const out: { file: string; line: number; plan: string; snippet: string }[] = [];
  for (const unit of units) {
    for (const r of rulings) {
      const exempt = r.framingMarkers.some((m) => unit.text.includes(m));
      if (exempt) continue;
      const token = r.bannedTokens.find((re) => re.test(unit.text));
      if (!token) continue;
      const lines = unit.text.split('\n');
      const idx = lines.findIndex((l) => token.test(l));
      const snippet = (lines[idx >= 0 ? idx : 0] ?? unit.text).trim().slice(0, 120);
      out.push({ file, line: unit.startLine + (idx >= 0 ? idx : 0), plan: r.plan, snippet });
    }
  }
  return out;
}

/** 递归收集扫描域内全部非排除 `.ts` 文件绝对路径。 */
function collectTsFiles(abs: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(abs, name);
    let st: Stats;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectTsFiles(p, acc);
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    if (name.endsWith('.test.ts')) continue; // 测试可正名断言·排除
    if (p.includes(`${'migration'}/`) || /(^|\/)migration(\/|$)/.test(p)) continue; // 迁移工件=append-only 史实
    acc.push(p);
  }
}

function main(): void {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const wrap = (code: string) => (color ? code : '');
  const GREEN = wrap('\x1b[32m');
  const RED = wrap('\x1b[31m');
  const BOLD = wrap('\x1b[1m');
  const RST = wrap('\x1b[0m');

  console.log(`${BOLD}── Verify overturned-ruling comment sync ──${RST}`);

  const files: string[] = [];
  for (const root of SOURCE_ROOTS) collectTsFiles(join(REPO_ROOT, root), files);

  const violations: { file: string; line: number; plan: string; snippet: string }[] = [];
  for (const abs of files) {
    const rel = abs.slice(REPO_ROOT.length + 1);
    let src: string;
    try {
      src = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const v of findViolations(rel, extractCommentUnits(src))) violations.push(v);
  }

  if (violations.length > 0) {
    console.log(
      `${RED}✗ 代码注释残留「已推翻裁定」失实现态断言（须随后继 plan 翻账订正或加历史框定词）：${RST}`,
    );
    for (const v of violations)
      console.log(`  - ${v.file}:${v.line}  被禁源于 ${v.plan}  ｜ ${v.snippet}`);
    console.log(
      `\n  依据 OVERTURNED_RULINGS 登记表（scripts/verify-overturned-rulings.ts）：` +
        `\n  裁定被反悔后，注释要么改述当前真相，要么同行/同块带历史框定词（原·归位·DROP·寄居·已退场…）。`,
    );
    process.exit(1);
  }

  console.log(
    `${GREEN}${BOLD}overturned-rulings PASSED${RST} — ${files.length} 文件 · ` +
      `${OVERTURNED_RULINGS.length} 条已推翻裁定登记 · 代码注释零失实现态断言（豁免面全为历史叙述）`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}

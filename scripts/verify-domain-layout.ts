// domain 标准子目录法「恒等闸」（domain_布局恒等闸 · 新增 CI 门禁 · 高危 · 经人签核）。
//
// 目的：把 architecture「Domain sub-directory law & naming」从「人工自觉 + 代码评审」升格为
// **机制强制**——`apps/api/src/modules/<ctx>/domain/` 下每个 `.ts`（含测试）必须落在 canonical
// 子目录之一；躺在 `domain/` 根、或落在非规范子目录 → fail-loud（exit 1）。防「domain 根散件」再漂移。
//
// 边界（防误红）：**只扫 `apps/api/*/domain`**。`subscriptions`/`workspaces` 的 domain 居 `libs/core`
// （另一规则·包根词表如 `authorization-rules.ts` 合法）→ 不纳入；`auth`/`platform` 无 domain → 自然跳过。
// 纯目录扫描、便宜，故 `pnpm run ci` 的 full/quick 均跑、尽早失败（与 type-escape 同置）。
//
// 用法：node scripts/verify-domain-layout.ts            检查（违规→exit 1）

import { readdirSync, type Stats, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const MODULES_DIR = join(REPO_ROOT, 'apps/api/src/modules');

// canonical 子目录集——SSOT 见 docs/specs/architecture.md「Domain sub-directory law & naming」。
// 本集是宪法的 enforcement 副本：宪法若增子目录，须同步此处（并补自测）。
export const CANONICAL_DOMAIN_SUBDIRS = [
  'entities',
  'value-objects',
  'events',
  'repositories',
  'ports',
  'policies',
  'constants',
] as const;

/**
 * 纯核（可单测）：给定相对 `domain/` 的文件路径数组，返回违反子目录法者。
 * 判据 = 相对路径**首段目录名**须 ∈ canonical；文件直躺 domain 根时首段即文件名（含 `.ts`）→ 违规。
 */
export function findViolationsFromRelPaths(
  relPaths: readonly string[],
  allowedSubdirs: readonly string[] = CANONICAL_DOMAIN_SUBDIRS,
): string[] {
  const allowed = new Set(allowedSubdirs);
  return relPaths.filter((rel) => {
    const firstSeg = rel.split('\\').join('/').split('/')[0];
    return !allowed.has(firstSeg);
  });
}

/** 递归收集 `domainAbs` 下全部 `.ts` 文件，返回相对 `domainAbs` 的路径（posix 分隔）。 */
function collectDomainRelTsFiles(domainAbs: string): string[] {
  const acc: string[] = [];
  const walk = (curAbs: string, relPrefix: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(curAbs);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      const abs = join(curAbs, name);
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      let st: Stats;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs, rel);
      else if (name.endsWith('.ts')) acc.push(rel);
    }
  };
  walk(domainAbs, '');
  return acc;
}

function main(): void {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const wrap = (code: string) => (color ? code : '');
  const GREEN = wrap('\x1b[32m');
  const RED = wrap('\x1b[31m');
  const BOLD = wrap('\x1b[1m');
  const RST = wrap('\x1b[0m');

  console.log(`${BOLD}── Verify domain sub-directory layout ──${RST}`);

  let moduleNames: string[];
  try {
    moduleNames = readdirSync(MODULES_DIR);
  } catch {
    console.log(`${RED}${BOLD}domain layout FAILED${RST} — 找不到 apps/api/src/modules`);
    process.exit(1);
  }

  let scanned = 0;
  let files = 0;
  const violations: { ctx: string; rel: string }[] = [];
  for (const ctx of moduleNames.sort()) {
    const domainAbs = join(MODULES_DIR, ctx, 'domain');
    let st: Stats;
    try {
      st = statSync(domainAbs);
    } catch {
      continue; // 无 domain 的上下文（auth/platform 等）跳过
    }
    if (!st.isDirectory()) continue;
    scanned += 1;
    const rels = collectDomainRelTsFiles(domainAbs);
    files += rels.length;
    for (const rel of findViolationsFromRelPaths(rels)) violations.push({ ctx, rel });
  }

  if (violations.length > 0) {
    console.log(`${RED}✗ domain 根散件 / 非规范子目录（须落 7 canonical 子目录之一）：${RST}`);
    for (const { ctx, rel } of violations)
      console.log(`  - apps/api/src/modules/${ctx}/domain/${rel}`);
    console.log(
      `\n  依据 docs/specs/architecture.md「Domain sub-directory law & naming」：` +
        `entities/ value-objects/ events/ repositories/ ports/ policies/ constants/。`,
    );
    process.exit(1);
  }

  console.log(
    `${GREEN}${BOLD}domain layout PASSED${RST} — ${scanned} 上下文 · ${files} 个 domain .ts 件全落规范子目录（零根散件）`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}

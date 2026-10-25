// Feature 私有叠加层双向隔离闸（odoo-saas-start docs/plans/module-odoo-rpc-frontend.md §4-3 ·
// 高危#3 经人签核 2026-10-25 · 宪法依据 docs/specs/architecture.md §features/ 专属区条）。
//
// 判据（违例即 fail-loud，把「纪律」升级为「机制」）：
//  A. `apps/api/src/modules/**` 禁止 import 任何 `features/**`——领域上下文不得反向依赖对接件；
//  B. `apps/api/src/features/**`（装配桩 feature-loader.ts 豁免——它就是唯一合法耦合点）禁止
//     import 任何上下文的深层件：路径含 `modules/<ctx>/(domain|infrastructure)/` 即违例
//     （features 只许经上下文公开入口/application 耦合）。
// 缺席态自然绿：无副本时 B 面零文件，A 面本就要求恒零。
// 诚实边界：只扫静态 `from`/动态 `import()` 字面量（源码面）；跨 feature 深导入等更细规则
// 待第二入住者出现再扩（避免为不存在的消费者预建复杂度）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const API_SRC = join(REPO_ROOT, 'apps/api/src');

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** 递归收集目录下 .ts 源件（跳过 .map/manifest 与非源层）。 */
function tsFiles(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(abs));
    else if (entry.name.endsWith('.ts')) out.push(abs);
  }
  return out;
}

const violations: string[] = [];

function scan(file: string, test: (spec: string) => boolean, label: string): void {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    if (test(m[1] as string)) {
      violations.push(`${label}: ${relative(REPO_ROOT, file)} → import '${m[1]}'`);
    }
  }
}

// A. modules/** → features/**（恒零要求，与副本在场与否无关）
for (const f of tsFiles(join(API_SRC, 'modules'))) {
  scan(f, (s) => s.includes('features/'), 'modules 反向依赖 features');
}

// B. features/**（装配桩除外）→ 任一上下文深层件
for (const f of tsFiles(join(API_SRC, 'features'))) {
  if (f.endsWith('feature-loader.ts')) continue;
  scan(f, (s) => /modules\/[^/]+\/(domain|infrastructure)\//.test(s), 'features 深引上下文内部件');
}

if (violations.length) {
  for (const v of violations) console.error(`✗ ${v}`);
  console.error('feature isolation FAILED');
  process.exit(1);
}
console.log('✓ feature isolation: no violations');

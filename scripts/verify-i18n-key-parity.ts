// i18n「键级完整性」恒等闸（plan module-i18n-key-parity 切片 A+B·借鉴线 X3·只读非破坏）。
//
// 补齐现有两闸都未覆盖的键级盲区（verify:i18n-assets 只验产物装载 + 3 硬编码键·
// validation-i18n.e2e 只验单探针本地化）：
//   切片 A（跨语言键集恒等）：从文件系统发现 locale（当前 zh/en·ja 已由 module-i18n-drop-ja 摘除），
//     逐 namespace 断言各 locale 的「文件集」与「flatten 键集」两两全等——防某语言漏译/多出孤立键。
//   切片 B（静态引用键 ⇄ 默认 locale 存在）：扫源码里以单/双引号字面量引用的 `<ns>.<path>` 键，
//     断言每个都能在默认 locale（zh）资产命中——防「引用不存在的键 → 运行期静默回退成 key」。
//
// 诚实边界：
//   - 动态拼键（如 mailer.service.ts 的 `emails.${tpl}.${key}` 模板串）无法静态枚举→切片 B 只纳字面量
//     引用，动态面由切片 A 的 namespace 级键集恒 + verify:i18n-assets 的模板↔mjml 兜底，本闸不 overclaim「全量引用已闸」。
//   - 不做反向死键硬闸（ⓐ 裁·FP 高）：资产有而源码未引的键不算失败。
//   - locale 从目录发现·不硬编码语言数；namespace 由默认 locale 的 .json 派生。
//
// 触发：`pnpm run verify:i18n-key-parity`（未接 ci.ts·门禁接线随高危另签·见 plan 切片 C）。
// 运行时=Node（type-strip）：仅 node:fs/node:path，零第三方依赖。

import * as fs from 'node:fs';
import * as path from 'node:path';

const I18N_ROOT = path.join('apps', 'api', 'src', 'i18n');
const DEFAULT_LOCALE = 'zh'; // ⓒ 裁：无头/fallback 现回落 zh（validation-i18n.e2e 实证）
const SCAN_ROOTS = [path.join('apps', 'api', 'src'), 'libs'];

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (color ? code : '');
const GREEN = wrap('\x1b[32m');
const RED = wrap('\x1b[31m');
const YELLOW = wrap('\x1b[33m');
const BOLD = wrap('\x1b[1m');
const RST = wrap('\x1b[0m');

const failures: string[] = [];
const warnings: string[] = [];
const ok = (msg: string) => console.log(`${GREEN}✓${RST} ${msg}`);
const bad = (msg: string) => {
  console.log(`${RED}✗ ${msg}${RST}`);
  failures.push(msg);
};
const warn = (msg: string) => {
  console.log(`${YELLOW}⚠ ${msg}${RST}`);
  warnings.push(msg);
};

/** 递归 flatten JSON 为点分键路径集合（兼容 flat-dotted-key 与真嵌套两种形态）。 */
function flattenKeys(node: unknown, prefix = ''): Set<string> {
  const out = new Set<string>();
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const sub of flattenKeys(v, p)) out.add(sub);
      } else {
        out.add(p);
      }
    }
  }
  return out;
}

/** locale = I18N_ROOT 下含至少一个 .json 的子目录（emails/ 只有 mjml→自动排除）。 */
function discoverLocales(): string[] {
  if (!fs.existsSync(I18N_ROOT)) {
    console.log(`${RED}${BOLD}i18n key parity FAILED${RST} — i18n 根不存在：${I18N_ROOT}`);
    process.exit(1);
  }
  return fs
    .readdirSync(I18N_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((d) => fs.readdirSync(path.join(I18N_ROOT, d)).some((f) => f.endsWith('.json')))
    .sort();
}

console.log(`${BOLD}── Verify i18n key parity (source assets) ──${RST}`);

const locales = discoverLocales();
if (!locales.includes(DEFAULT_LOCALE)) {
  console.log(
    `${RED}${BOLD}FAILED${RST} — 默认 locale「${DEFAULT_LOCALE}」资产缺失（发现：${locales.join(', ')}）`,
  );
  process.exit(1);
}
ok(`发现 locale：${locales.join(' / ')}（默认=${DEFAULT_LOCALE}）`);

// 每 locale → { namespace(=json basename 去后缀) → flatten 键集（含 namespace 前缀的全键）}
function localeNamespaces(locale: string): Map<string, Set<string>> {
  const dir = path.join(I18N_ROOT, locale);
  const map = new Map<string, Set<string>>();
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith('.json'))
    .sort()) {
    const ns = f.replace(/\.json$/, '');
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as unknown;
    const full = new Set<string>();
    for (const k of flattenKeys(raw)) full.add(`${ns}.${k}`);
    map.set(ns, full);
  }
  return map;
}

const perLocale = new Map<string, Map<string, Set<string>>>();
for (const l of locales) perLocale.set(l, localeNamespaces(l));

// ── 切片 A：跨语言 namespace 文件集 + 逐 namespace 键集全等 ──
const allNs = new Set<string>();
for (const m of perLocale.values()) for (const ns of m.keys()) allNs.add(ns);

const EMPTY = new Set<string>();
const hasNs = (l: string, ns: string): boolean => perLocale.get(l)?.has(ns) ?? false;
const nsSet = (l: string, ns: string): Set<string> => perLocale.get(l)?.get(ns) ?? EMPTY;

console.log(`${BOLD}· 切片 A — 跨语言键集恒等${RST}`);
let driftA = 0;
for (const ns of [...allNs].sort()) {
  // namespace 文件集对等：某 locale 缺该 namespace 文件即红
  const missingFile = locales.filter((l) => !hasNs(l, ns));
  if (missingFile.length) {
    bad(`namespace「${ns}」文件缺失于：${missingFile.join(', ')}`);
    driftA += missingFile.length;
    continue;
  }
  // 全键并集·逐 locale 比对差集
  const union = new Set<string>();
  for (const l of locales) for (const k of nsSet(l, ns)) union.add(k);
  const localDrift: string[] = [];
  for (const k of [...union].sort()) {
    const present = locales.filter((l) => nsSet(l, ns).has(k));
    if (present.length !== locales.length) {
      const absent = locales.filter((l) => !nsSet(l, ns).has(k));
      localDrift.push(`  ${k}  缺于 ${absent.join(', ')}`);
    }
  }
  if (localDrift.length) {
    bad(`namespace「${ns}」键集漂移 ${localDrift.length} 项：\n${localDrift.join('\n')}`);
    driftA += localDrift.length;
  } else {
    ok(`namespace「${ns}」${locales.join('/')} 键集全等（${union.size} 键）`);
  }
}

// ── 切片 B：静态引用键 ⇄ 默认 locale 存在 ──
console.log(`${BOLD}· 切片 B — 静态引用键存在于默认 locale「${DEFAULT_LOCALE}」${RST}`);
const zhKeys = new Set<string>();
for (const s of perLocale.get(DEFAULT_LOCALE)?.values() ?? []) for (const k of s) zhKeys.add(k);

const nsPattern = [...allNs].map((ns) => ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const refRe = new RegExp(`['"]((?:${nsPattern})\\.[\\w.]+)['"]`, 'g');

function collectTsFiles(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectTsFiles(p, acc);
    else if (
      e.isFile() &&
      p.endsWith('.ts') &&
      !/\.test\.ts$/.test(p) &&
      !p.includes(`${path.sep}dist${path.sep}`)
    ) {
      acc.push(p);
    }
  }
}

const tsFiles: string[] = [];
for (const r of SCAN_ROOTS) collectTsFiles(r, tsFiles);

const staticRefs = new Map<string, string>(); // key -> first file
let refCount = 0;
for (const file of tsFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(refRe)) {
    refCount += 1;
    if (!staticRefs.has(m[1])) staticRefs.set(m[1], file);
  }
}

let driftB = 0;
for (const [key, file] of [...staticRefs].sort()) {
  if (!zhKeys.has(key)) {
    bad(
      `源码静态引用键「${key}」不存在于 ${DEFAULT_LOCALE} 资产（首现 ${file}）→ 运行期会静默回退成 key`,
    );
    driftB += 1;
  }
}
if (driftB === 0) {
  ok(`${refCount} 处静态引用（去重 ${staticRefs.size} 键）全部命中 ${DEFAULT_LOCALE} 资产`);
}

// 动态拼键豁免面告（不硬闸·诚实标注边界）：源码含 `<ns>.${` 模板串→本闸不静态校验。
const dynRe = new RegExp('`(?:[^`]*)(?:' + nsPattern + ')\\.\\$\\{');
const dynamicFiles = tsFiles.filter((f) => dynRe.test(fs.readFileSync(f, 'utf8')));
if (dynamicFiles.length) {
  warn(
    `动态拼键 out-of-scope（${dynamicFiles.length} 文件·如 ${dynamicFiles.map((f) => path.basename(f)).join(', ')}）：模板串键无法静态枚举·由切片 A namespace 恒等 + verify:i18n-assets 兜底`,
  );
}

console.log('──────────────────────────');
if (failures.length > 0) {
  console.log(
    `${RED}${BOLD}i18n key parity FAILED${RST} — ${failures.length} 项不符（切片 A 漂移 ${driftA} · 切片 B 漂移 ${driftB}）`,
  );
  process.exit(1);
}
console.log(
  `${GREEN}${BOLD}i18n key parity PASSED${RST} — 跨语言键集恒等 + 静态引用键全命中${warnings.length ? `（动态豁免 ${warnings.length} 处）` : ''}`,
);

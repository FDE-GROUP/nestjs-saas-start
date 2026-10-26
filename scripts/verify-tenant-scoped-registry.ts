// 租户实体登记恒等闸（module-tenant-scoped-entity-registry-gate · 新增 CI 门禁 · 高危 #3 · 经人签核 2026-10-26）。
//
// 目的：把「哪些表属租户作用域、读面必须带隔离轴卡点」从「约定 + 人工评审」升格为
// **机制恒等校验**——boilerplate 核查（nestjs-saas-tenant-boilerplate·tmp/tenant-bp-review）暴露
// 同形人祸：其 `tenant.config.ts` 手写白名单，新实体漏登记 = 静默无过滤无闸拦截。本案复刻
// `GATED_E2E_FILES`（ci-fullstack.ts）三向判据形态，对本文件内置登记表与代码实存做纯文本对拍。
//
// 换轴（global-tenant-organization-rehierarchy 切片 C·高危 #3 随案复裁）：隔离硬轴从
// `organizationId` 升为 `tenantId`。列位证据改**双形判定**：`tenantId` 主轴证据必中；
// `organizationId` 证据在 expand–contract 过渡期仍视同租户域列（member/invitation 等 BA 操作面
// 留 org 轴·旧订阅表待 D 片退场）——两形任一在册均须登记，防过渡期静默漏面；contract 段
// （旧表退役/列收紧）后本闸收敛为纯 `tenantId` 判定。
//
// 判据（三向 fail-loud·登记表与判据同居本文件·SSOT 自含）：
//  ① 有列须在册：运行时实体块（`defineEntity({...})` / `*_META: TableMeta = {...}` 所在对象字面量）
//     内检出 `tenantId`/`organizationId` **列位**证据（属性形 `x: p.` 或 FK 元组形 `['x', {`）
//     的表，其 tableName 必须 ∈ 在册 ∪ 豁免（漏登记红）；
//  ② 在册须实存：在册表必须在某实体块中检出列证据（改名/误登记红）；
//  ③ 豁免防腐：豁免语义锚在「携租户列而应然全局可见」——豁免表块实存但列已删（列被撤而豁免
//     忘撤）→ 红；无租户列的表本不触①，对其豁免条目不判矛盾（零假红）。
//
// 诚实边界（不可机器化·明写不覆盖）：实体有列但仓储读链漏带 where——本闸**不管**（逐仓储静态判定
// where 形状不便宜、假阳高），该面仍由既有「镜像隔离单测 + 固定展开序」纪律承担（plan §2 非目标）。
// 防假阳：uniques/indexes 的 `properties: ['organizationId', ...]` 纯字符串引用天然不匹配两列证据
// pattern；散文/注释行因不含 `p.`/`{` 紧随形不入库级判定；`database/mikro/migration/**`（迁移忠实
// 装配面·运行时读面零消费）与快照件排除——防迁移基线双描述触发假红（DDL 恒等闸另有守护）。
//
// 用法：node scripts/verify-tenant-scoped-registry.ts            检查（违规→exit 1）

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 租户作用域表登记表（SSOT·自含单文件·沿同族 verify 脚本零跨模块导入惯例）──
// 理由：scripts/tsconfig 只收 *.test.ts 且根 tsconfig `allowImportingTsExtensions:false`——
// 单测级联面不容 `.ts` 后缀导入，而脚本 node 直跑又需显式扩展；两难下合并为单文件自含，
// 单测经 `./verify-tenant-scoped-registry`（扩展名省略·vitest 可解）消费全部导出。
//
// `TENANT_SCOPED_TABLES` = 「携带租户轴列（`tenantId` 主轴 ∪ 过渡期 `organizationId` 归属轴）、其读面
// **必须**带租户卡点（仓储 where 锚定活动租户 / BA 操作 api 租户界内）」的表清单——在册是**应然断言**，
// 实际强制仍由既有「镜像隔离单测 + 固定展开序」（module-rbac-query-level-filtering / global-tenancy S2）承担；
// 本清单供本闸做「清单 vs 代码实存」三向对拍（有列须在册 / 在册须实存 / 豁免防腐）。
// 生长纪律：新增带租户列的运行时实体而未在册 → fail-loud，须在此具名登记（或入豁免面并写明
// 理由）——堵 boilerplate 核查（tmp/tenant-bp-review）暴露的「新实体漏登记=静默无过滤」同形人祸。

/** 在册租户作用域表（tableName 恒等口径·沿列律 L1 表名寻址）。 */
export const TENANT_SCOPED_TABLES: readonly string[] = [
  // 业务数据面（ rehierarchy C 换轴：读锚 tenantId 主轴·写双盖章）。
  'post',
  'workspace',
  // 组织本体入册（rehierarchy C：organization 携 tenantId 后降为租户域内业务表·
  // 目录/治理读面锚租级；tenant 表自身是租根、不持租户轴列、不触判据）。
  'organization',
  // 订阅面（rehierarchy 片二 K2：旧 `organization_subscription` 整表 DROP·仅余租级新表在册）。
  'tenant_subscription',
  // RBAC 三表之二（role/audit 持租级列；grant 经 roleId 传递、无自列不入判）。
  'organization_role',
  'organization_role_audit',
  // BA 组织容器族：读面仍 org 轴锚定（BA 机器不盖租级列·C 片自裁不换）·消费界内无裸跨租面。
  'member',
  'invitation',
];

/**
 * 豁免表（**仅当块内实存租户轴列**才需入此——应然全局可见 + 具名理由）。
 * 无租户列的表本不触判据①，**不得**列入——防把「天然全局」误分类成「豁免」（初稿即犯此错·现树探红坐实）。
 * 初始实扫（2026-10-26）+ rehierarchy C 换轴重扫：带租户列的运行时表全部应然在册，豁免面为空是**当前真相**，
 * 非机制空转——判据③随首个真豁免条目生长而活。
 */
export const TENANT_SCOPED_EXEMPT_TABLES: readonly { table: string; reason: string }[] = [];

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
// 扫描域（后端运行时实体面·沿 overturned-rulings 口径）。
const SOURCE_ROOTS = ['libs/core/src', 'apps/api/src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.tanstack', 'coverage', '.next', 'build']);
// 排除面：测试件 / 迁移忠实装配（双描述源头·非运行时读面）/ ORM 快照。
const SKIP_PATH_FRAGMENTS = ['/migrations/', '/migration/', '.snapshot'];

/** 表名锚点：实体对象字面量内的 `tableName: 'x'`。 */
const TABLE_NAME_RE = /^\s*tableName:\s*'([^']+)'/;
/** 块起点锚：`defineEntity({`（define 形）与 `X_META: TableMeta = {`（工厂形）。 */
const BLOCK_OPENERS: readonly RegExp[] = [/defineEntity\(\{/, /:\s*TableMeta\s*=\s*\{/];
/** 列位证据·主轴属性形（defineEntity properties 块内 `tenantId: p.string()...`）。 */
const TENANT_COLUMN_PROP_RE = /tenantId:\s*p\./;
/** 列位证据·主轴 FK 元组形（TableMeta columns 内 `['tenantId', { k: 'fk'... }]`；
 *  uniques/indexes 的纯字符串引用因无 `{` 紧随天然不中。 */
const TENANT_COLUMN_TUPLE_RE = /\['tenantId',\s*\{/;
/** 过渡期归属轴证据·属性形（`organizationId: p.`·contract 段 BA 面撤列后随判据收敛）。 */
const ORG_COLUMN_PROP_RE = /organizationId:\s*p\./;
/** 过渡期归属轴证据·FK 元组形（同上）。 */
const ORG_COLUMN_TUPLE_RE = /\['organizationId',\s*\{/;

export interface TableBlock {
  /** 实体表名（tableName 恒等口径）。 */
  readonly table: string;
  /** 相对仓库根的源文件路径（违规回显）。 */
  readonly file: string;
  /** 块体文本（含花括号原文·列证据判定面）。 */
  readonly body: string;
}

/**
 * 从单文件源码抽出全部实体块（表名锚点回溯最近块起点 + 花括号配对定界）。
 * 多表同文件（ba-org.entities.ts / rbac.entities.ts）逐块独立判定——块边界即判据边界。
 */
export function findTableBlocks(relPath: string, src: string): TableBlock[] {
  if (!src.includes('organizationId') && !src.includes('tenantId') && !TABLE_NAME_RE.test(src))
    return [];
  const lines = src.split('\n');
  const blocks: TableBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = TABLE_NAME_RE.exec(lines[i] ?? '');
    if (!m) continue;
    // 回溯距锚点行最近的块起点。
    let openerIdx = -1;
    for (let j = i; j >= 0; j--) {
      const hit = BLOCK_OPENERS.some((re) => re.test(lines[j] ?? ''));
      if (hit) {
        openerIdx = j;
        break;
      }
    }
    if (openerIdx < 0) continue;
    // 自起点行首个 `{` 起花括号配对（跳字符串字面量·嵌套计数）。
    const start = lines
      .slice(openerIdx, i + 1)
      .join('\n')
      .indexOf('{');
    let depth = 0;
    let end = -1;
    let inString: string | null = null;
    const joined = lines.slice(openerIdx).join('\n');
    for (let k = start; k < joined.length; k++) {
      const ch = joined[k] as string;
      if (inString) {
        if (ch === '\\') k++;
        else if (ch === inString) inString = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = k;
          break;
        }
      }
    }
    if (end < 0) continue;
    blocks.push({ table: m[1] as string, file: relPath, body: joined.slice(start, end + 1) });
  }
  return blocks;
}

/** 块体内是否检出租户轴列位证据（主轴 tenantId ∪ 过渡期 organizationId·四 pattern 任一）。 */
export function hasTenantColumn(block: TableBlock): boolean {
  return (
    TENANT_COLUMN_PROP_RE.test(block.body) ||
    TENANT_COLUMN_TUPLE_RE.test(block.body) ||
    ORG_COLUMN_PROP_RE.test(block.body) ||
    ORG_COLUMN_TUPLE_RE.test(block.body)
  );
}

export type RegistryViolation =
  | { kind: 'unregistered'; table: string; file: string }
  | { kind: 'stale-registry'; table: string }
  | { kind: 'exempt-stale'; table: string };

/**
 * 三向恒等判定（纯函数·fixture 可注）。
 *
 * @param blocks - 全仓实体块抽取结果
 * @param scoped - 在册租户作用域表清单（SSOT 注入·测试可替身）
 * @param exempt - 豁免表清单（含理由）
 */
export function findRegistryViolations(
  blocks: readonly TableBlock[],
  scoped: readonly string[] = TENANT_SCOPED_TABLES,
  exempt: readonly { table: string; reason: string }[] = TENANT_SCOPED_EXEMPT_TABLES,
): RegistryViolation[] {
  const withColumn = blocks.filter(hasTenantColumn);
  const tablesWithColumn = new Set(withColumn.map((b) => b.table));
  const allTables = new Set(blocks.map((b) => b.table));
  const exemptTables = new Set(exempt.map((e) => e.table));
  const violations: RegistryViolation[] = [];

  // ① 有列须在册。
  for (const b of withColumn) {
    if (!scoped.includes(b.table) && !exemptTables.has(b.table))
      violations.push({ kind: 'unregistered', table: b.table, file: b.file });
  }
  // ② 在册须实存（列证据在·防改名/误登记）。
  for (const t of scoped) {
    if (!tablesWithColumn.has(t)) violations.push({ kind: 'stale-registry', table: t });
  }
  // ③ 豁免防腐：豁免语义 =「携租户列而应然全局可见」——块实存但列已删（列被撤而豁免忘撤）才红；
  // 表无租户列（如容器根 organization）本不触①，豁免条目对其不构成矛盾，不判 no-block。
  for (const e of exempt) {
    if (allTables.has(e.table) && !tablesWithColumn.has(e.table))
      violations.push({ kind: 'exempt-stale', table: e.table });
  }
  return violations;
}

function collectTsFiles(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      collectTsFiles(abs, out);
    } else if (name.endsWith('.ts')) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      if (/\.(test|e2e\.test)\.ts$/.test(name)) continue;
      if (SKIP_PATH_FRAGMENTS.some((f) => `/${rel}`.includes(f))) continue;
      out.push(abs);
    }
  }
}

function main(): void {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const wrap = (code: string) => (color ? code : '');
  const GREEN = wrap('\x1b[32m');
  const RED = wrap('\x1b[31m');
  const BOLD = wrap('\x1b[1m');
  const RST = wrap('\x1b[0m');

  console.log(`${BOLD}── Verify tenant-scoped entity registry ──${RST}`);

  const files: string[] = [];
  for (const root of SOURCE_ROOTS) collectTsFiles(join(REPO_ROOT, root), files);

  const blocks: TableBlock[] = [];
  for (const abs of files) {
    const rel = abs.slice(REPO_ROOT.length + 1);
    try {
      blocks.push(...findTableBlocks(rel, readFileSync(abs, 'utf8')));
    } catch {}
  }

  const violations = findRegistryViolations(blocks);
  if (violations.length > 0) {
    console.log(
      `${RED}✗ 租户作用域实体登记表与代码实存不恒等（须随案更新本文件 TENANT_SCOPED_TABLES/EXEMPT）：${RST}`,
    );
    for (const v of violations) {
      if (v.kind === 'unregistered')
        console.log(
          `  - [漏登记] 表 ${v.table} 携租户轴列（tenantId/organizationId）但不在册/未豁免  ｜ ${v.file}`,
        );
      else if (v.kind === 'stale-registry')
        console.log(`  - [僵尸在册] 表 ${v.table} 在册却检出不到租户轴列实存`);
      else console.log(`  - [豁免腐烂] 豁免表 ${v.table} 实体块仍在但租户轴列已删·豁免须随案撤销`);
    }
    console.log(
      `\n  依据 module-tenant-scoped-entity-registry-gate：新增带租户列表 → 具名入 TENANT_SCOPED_TABLES` +
        `\n  （读面必须带租户卡点）或 TENANT_SCOPED_EXEMPT_TABLES（应然全局可见 + 写明理由）。`,
    );
    process.exit(1);
  }

  const withColumn = blocks.filter(hasTenantColumn).length;
  console.log(
    `${GREEN}${BOLD}tenant-scoped-registry PASSED${RST} — ${files.length} 文件 · ` +
      `${blocks.length} 实体块 · ${withColumn} 块携租户列 · ` +
      `在册 ${TENANT_SCOPED_TABLES.length} + 豁免 ${TENANT_SCOPED_EXEMPT_TABLES.length} 恒等`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}

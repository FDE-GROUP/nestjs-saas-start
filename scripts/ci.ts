// 本地 CI 编排器 —— 在开发者机器上一次跑完全部质量门禁，替代远程 CI。
// 两种模式：full（默认）= check → build（libs→nest）→ test 三道硬门禁 + fallow 架构佐证；
// quick = 仅 check + test（跳过 build 与 fallow，供快速回归）。硬性门禁快速失败；
// fallow 仅作佐证（其结论须二次人工核验，见 docs/specs/tooling-standards.md §4.7），
// 任何情况下都不使流水线失败。触发：`pnpm run ci` / `pnpm run ci:quick`，或 push 时
// 由 .husky/pre-push 自动执行（full）。
//
// 运行时=Node（弃 Bun）：不再依赖 `bun:shell`，改用 node:child_process spawnSync 调 pnpm。

import { spawnSync } from 'node:child_process';

const quick = process.argv[2] === 'quick';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (color ? code : '');
const GREEN = wrap('\x1b[32m');
const RED = wrap('\x1b[31m');
const YELLOW = wrap('\x1b[33m');
const BOLD = wrap('\x1b[1m');
const DIM = wrap('\x1b[2m');
const RST = wrap('\x1b[0m');

let failed = 0;

// 经 pnpm 运行 package.json 脚本；nothrow：不因非零退出抛错，交由调用方按 exit code 处置。
function run(...args: string[]): number {
  const res = spawnSync('pnpm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return res.status ?? 1;
}

function step(name: string, code: number): void {
  console.log(`${BOLD}▶ ${name}${RST}`);
  if (code === 0) {
    console.log(`${GREEN}✓ ${name} passed${RST}\n`);
  } else {
    console.log(`${RED}✗ ${name} failed (exit ${code})${RST}\n`);
    failed = 1;
  }
}

console.log(`${BOLD}── Local CI (${quick ? 'quick' : 'full'}) ──${RST}`);
console.log(`${DIM}Node ${process.version} · ${new Date().toLocaleString()}${RST}\n`);

step('Lint & format (biome)', run('run', 'check'));
// 类型逃逸「只紧不扫」棘轮（module-common-type-escape-ratchet·高危#4 经人签核落地）：
// 存量入基线单源，新增超基线即 fail。纯文本扫描、便宜，故 full/quick 均跑、尽早失败。
step('Type-escape ratchet', run('run', 'verify:type-escape'));
// domain 标准子目录法恒等闸（docs/specs/architecture.md「Domain sub-directory law & naming」）：
// 扫 apps/api/*/domain，根散件 / 非规范子目录即 fail-loud（防归位后再漂移）。纯目录扫描、便宜，
// 故与 type-escape 同置 full/quick 均跑、早失败；libs/core 另规则不纳入（防误红）。
step('Domain layout guard', run('run', 'verify:domain-layout'));
// Feature 私有叠加层双闸（odoo-saas-start docs/plans/module-odoo-rpc-frontend.md §4-3 · 高危#3
// 经人签核 2026-10-25）：① verify:feature-isolation——features/↔modules/ 双向隔离宪条的机制强制
// （违例 fail-loud）；② check:features——私有真源↔同步副本 sha256 对拍，堵「改了私有忘同步」
// 腐烂。纯文本/目录扫、便宜，与 type-escape/domain-layout 同置 full/quick 均跑、早失败；
// 缺席态（公共机器无真源无副本）两闸天然绿——严格叠加·两态全绿判据的链内物化。
step('Feature isolation guard', run('run', 'verify:feature-isolation'));
step('Feature overlays check', run('run', 'check:features'));
// stories-drift 恒等闸（docs/stories 溯源纪律「只指文件名/方法名」的机制强制·新增门禁·高危经人签核）：
// 校验故事引用的关联 plan / `.ts` 文件名 / wire 错误码在仓内实存，断链即 fail-loud（防重命名/搬迁/
// 删除致讲解性 as-built 文档静默指向不存在之物）。纯文本 + 源树扫描、便宜，与 type-escape/domain-layout
// 同置 full/quick 均跑、早失败。诚实边界：只锁引用产物实存性（机械 drift），不校验散文语义正确性（归人评）。
step('Stories drift guard', run('run', 'verify:stories-drift'));
// i18n 键级完整性恒等闸（借鉴线 X3 · module-i18n-key-parity 切片 C · 半高危经人签核 2026-10-23）：
// ①跨语言（zh/en）逐 namespace 键集恒等 ②源码静态引用键⇄默认 locale 存在——防新增漏译/引用不存在的
// i18n 键致生产校验/邮件静默回退成 key 串（切片 B 首跑即抓修 8 处 lost-ref）。纯源树 + JSON 扫描、无构建依赖，
// 与 type-escape/domain-layout/stories-drift 同置 full/quick 均跑、早失败。诚实边界：动态拼键 out-of-scope·不做反向死键硬闸。
step('i18n key parity guard', run('run', 'verify:i18n-key-parity'));
// 「已推翻裁定」注释同步恒等闸（global-overturned-ruling-comment-gate · 新增门禁 · 高危经人签核 2026-10-23）：
// 内置登记表 OVERTURNED_RULINGS，扫代码注释（跳字符串）——命中被反悔裁定点名的失实 token 且同注释块无历史
// 框定词即 fail-loud（固化 global-organization-status-comment-sync 人肉清零·补 residual-cleanup 排除「注释
// 散文」的覆盖缺口）。纯文本扫描、便宜，与 domain-layout/stories-drift/i18n-parity 同置 full/quick 均跑、早
// 失败。诚实边界：只拦登记表点名 token（须随案补登·非通用语义检查）·框定豁免为启发式（防误红优先·零假阳性）。
step('Overturned rulings guard', run('run', 'verify:overturned-rulings'));
// 配置供给面「四角契约」恒等闸（global-config-contract-gate-in-chain 翻案 · 高危#3 经人签核 2026-10-23）：
// 撤销 config-env-surface-contract「切片 C 不做」/ config-seed「ci.ts 零改动」两裁，把已加固的
// verify:config-contract 升为硬门禁——判据①无死配置/②代码读键⊆（样例∪白名单）/③必填键⊆compose。防「撤旋钮
// 忘删样例键」静默腐烂（b3d3e5d 清 ES_TRUTH_SOURCE_TENANTS 即此类）。纯静态文本扫、亚秒级、无构建/DB 依赖，
// 与上列便宜闸同置 full/quick 均跑、早失败。逃生阀：合法「声明先于消费者」键走 WHITELIST 或取注释态上图（web-dev-proxy-key 前例）。
step('Config contract guard', run('run', 'verify:config-contract'));
if (!quick) {
  step('Build & typecheck (libs + nest)', run('run', 'build'));
  // 前端类型面纳入门禁（外部评审暴露第二盲区：ci 曾不 typecheck apps/web——
  // api-client schema.d.ts 脱钩当时须手动 typecheck 才现，入闸后自动拦截）。
  // 依赖 build 产出的 @saas/contracts + @saas/api-client dist，故置于 build 之后、仅 full 模式。
  step('Web typecheck (apps/web)', run('--filter', 'web', 'run', 'typecheck'));
  // 测试类型面纳入门禁（本轮暴露第三盲区：build 的 tsc 排 `*.test.ts`、vitest transpile-only
  // 不做类型检查 → posts/auth 两处测试类型错长期潜伏、只在手动 tsc 现形）。逐包复用各 tsconfig.json
  // （apps/api + libs 已含测试）+ packages/scripts 两个 test-inclusive 配置；web 测试由上面独立步已覆盖。
  // 多次全量 tsc 较重，故仅 full 模式（随 pre-push 强制），quick 不加。
  step('Test typecheck (all packages incl *.test.ts)', run('run', 'verify:test-types'));
  // 契约对拍（前端 F1 · module-frontend-api-client 丁裁）：以 build 产物直出 openapi.yaml，
  // 与入库的 openapi/openapi.yaml 逐字节对拍——改响应注解却未 `openapi:export` 重生成 → 此处拓红，
  // 逼「文档 SSOT 与代码同源」。需 DB-free dist，故仅 full 模式（build 之后）执行。
  // 本轮加固：同闸内再 `gen:types` 重生 api-client schema.d.ts 并纳入 git diff 对拍面，
  // 堵旧盲区（旧闸只比 yaml↔码、不覆盖 schema.d.ts↔yaml，曾掩盖 S6 漏重生）。
  step('OpenAPI codegen 对拍 (spec ↔ committed yaml ↔ schema.d.ts)', run('run', 'openapi:drift'));
  // 租户实体登记恒等闸（module-tenant-scoped-entity-registry-gate · 新增门禁 · 高危#3 经人签核 2026-10-26）：
  // 对脚本内置登记表与实体块实存做三向对拍（有列须在册/在册须实存/豁免防腐），
  // 堵 boilerplate 核查（tmp/tenant-bp-review）同形人祸「新实体漏登记=静默无过滤」。纯文本块定界扫描、亚秒级。
  // 仅入 full（裁点②随案采推荐·quick 不加）。诚实边界：不管「有列但仓储读链漏带 where」
  //（镜像隔离单测+固定展开序承担·plan §2 非目标）。防假阳：uniques/indexes 纯字符串引用不中列证据 pattern。
  step('Tenant-scoped registry guard', run('run', 'verify:tenant-scoped-registry'));
}
step('Tests (vitest)', run('run', 'test'));

// 佐证（advisory）：fallow 架构边界。工具未安装/报错也不阻断本地 CI；quick 模式跳过。
// fallow 为项目 devDependency（非 dlx 临时拉），经 package.json 脚本 `fallow:arch` 调本地二进制。
if (!quick) {
  console.log(`${BOLD}── Advisory (fallow) ──${RST}`);
  console.log(`${BOLD}▶ architecture boundaries${RST}`);
  const arch = run('run', 'fallow:arch');
  if (arch === 0) {
    console.log(`${GREEN}✓ no boundary violations${RST}\n`);
  } else if (arch === 1) {
    console.log(`${YELLOW}⚠ fallow findings — advisory only, verify manually (§4.7)\n${RST}`);
  } else {
    console.log(`${YELLOW}⚠ fallow unavailable/error (exit ${arch}) — skipped\n${RST}`);
  }
}

console.log('──────────────────────────');
if (failed) {
  console.log(`${RED}${BOLD}Local CI FAILED${RST}`);
  process.exit(1);
}
console.log(`${GREEN}${BOLD}Local CI PASSED${RST}`);

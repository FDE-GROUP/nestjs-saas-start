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
// stories-drift 恒等闸（docs/stories 溯源纪律「只指文件名/方法名」的机制强制·新增门禁·高危经人签核）：
// 校验故事引用的关联 plan / `.ts` 文件名 / wire 错误码在仓内实存，断链即 fail-loud（防重命名/搬迁/
// 删除致讲解性 as-built 文档静默指向不存在之物）。纯文本 + 源树扫描、便宜，与 type-escape/domain-layout
// 同置 full/quick 均跑、早失败。诚实边界：只锁引用产物实存性（机械 drift），不校验散文语义正确性（归人评）。
step('Stories drift guard', run('run', 'verify:stories-drift'));
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

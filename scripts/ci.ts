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
if (!quick) {
  step('Build & typecheck (libs + nest)', run('run', 'build'));
  // 前端类型面纳入门禁（外部评审暴露第二盲区：ci 曾不 typecheck apps/web——
  // api-client schema.d.ts 脱钩当时须手动 typecheck 才现，入闸后自动拦截）。
  // 依赖 build 产出的 @saas/contracts + @saas/api-client dist，故置于 build 之后、仅 full 模式。
  step('Web typecheck (apps/web)', run('--filter', 'web', 'run', 'typecheck'));
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

// i18n / 邮件模板「产物资产」回归防线——把 plan module-i18n-assets-resolution 的取证探针固化为门禁。
//
// 缘起：Vitest 在**源码树**跑（`apps/api/src/i18n` 里 json/mjml 与模块同层），而 nest-cli `assets`
// 剥 `sourceRoot` 前缀把数据拷到 `dist/i18n`——两套布局语义不一致时，**测试全绿但产物取不到译文**
// （曾实机坐实：`validate.email.required` 回退 key、MJML 模板 ENOENT）。本脚本只认编译产物：
//   1) 产物 loader 真取到中文/英文译文（非回退 key）；
//   2) 邮件模板文件在产物布局下可读且非空；
//   3) fail-closed：资产缺失场景必须**抛错**而非静默回退。
// 前置：先 `pnpm run build` 产出 dist。触发：`pnpm run verify:i18n-assets`。
//
// 运行时=Node：node:child_process 之外零第三方依赖（@nestjs/testing 为既有 devDependency）。

import { mkdtemp, readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';

const I18N_MODULE = 'dist/apps/api/src/i18n/i18n.module.js';
const ASSETS_ROOT_HELPER = 'dist/apps/api/src/i18n/assets-root.js';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (color ? code : '');
const GREEN = wrap('\x1b[32m');
const RED = wrap('\x1b[31m');
const BOLD = wrap('\x1b[1m');
const RST = wrap('\x1b[0m');

const failures: string[] = [];
const ok = (msg: string) => console.log(`${GREEN}✓${RST} ${msg}`);
const bad = (msg: string) => {
  console.log(`${RED}✗ ${msg}${RST}`);
  failures.push(msg);
};

console.log(`${BOLD}── Verify i18n assets (compiled output) ──${RST}`);

const moduleUrl = `file://${path.resolve(I18N_MODULE)}`;
const helperUrl = `file://${path.resolve(ASSETS_ROOT_HELPER)}`;

let assetsRoot: string;
let i18n: I18nService;
try {
  const helper = (await import(helperUrl)) as {
    resolveI18nAssetsRoot: (fromDir?: string) => string;
    resolveEmailsDir: (fromDir?: string) => string;
  };
  assetsRoot = helper.resolveI18nAssetsRoot();
  ok(`产物资产根解析 → ${assetsRoot}`);

  const { AppI18nModule } = (await import(moduleUrl)) as { AppI18nModule: unknown };
  const moduleRef = await Test.createTestingModule({ imports: [AppI18nModule as never] }).compile();
  await moduleRef.init();
  i18n = moduleRef.get(I18nService);
} catch (error) {
  console.log(`${RED}${BOLD}i18n assets FAILED${RST} — 产物无法装载 i18n：${String(error)}`);
  process.exit(1);
}

// 1) 译文必须命中真值（回退即等于 key 本身 → 判失败）
const cases = [
  { key: 'validate.email.required', lang: 'zh', expect: '请输入邮箱' },
  { key: 'validate.email.required', lang: 'en', expect: 'Please enter your email address' },
  { key: 'emails.welcome.subject', lang: 'zh', expect: '欢迎加入Nestjs' },
];
for (const { key, lang, expect } of cases) {
  const got = i18n.translate(key, { lang });
  if (got === key) bad(`translate 回退 key（资产没被读到）：${lang}/${key}`);
  else if (got !== expect) bad(`translate 值不符：${lang}/${key} → ${got}（期望 ${expect}）`);
  else ok(`translate ${lang}/${key} → ${got}`);
}

// 2) 邮件模板在产物布局下可读且非空
for (const tpl of ['welcome', 'verification', 'forgot-password', 'magic-link']) {
  const file = path.join(assetsRoot, 'emails', `${tpl}.mjml`);
  try {
    const content = await readFile(file, 'utf8');
    if (content.trim().length === 0) bad(`模板为空：${file}`);
    else ok(`模板可读 ${tpl}.mjml（${content.length}B）`);
  } catch {
    bad(`模板不可读（生产发信必抛 ENOENT）：${file}`);
  }
}

// 3) fail-closed：资产缺失必须抛错，不得静默回退
const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'i18n-missing-'));
try {
  const helper = (await import(helperUrl)) as {
    resolveI18nAssetsRoot: (fromDir?: string) => string;
  };
  helper.resolveI18nAssetsRoot(emptyDir);
  bad(`fail-closed 失效：空目录 ${emptyDir} 未抛错（静默回退风险）`);
} catch (error) {
  ok(`fail-closed 生效：资产缺失即抛错（${String(error).slice(0, 60)}…）`);
}

console.log('──────────────────────────');
if (failures.length > 0) {
  console.log(
    `${RED}${BOLD}i18n assets FAILED${RST} — ${failures.length} 项不符（编译产物面资产解析回归）`,
  );
  process.exit(1);
}
console.log(`${GREEN}${BOLD}i18n assets PASSED${RST} — 产物译文/模板/fail-closed 三面全绿`);

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// i18n / 邮件模板的「产物资产根」单点解析（plan module-i18n-assets-resolution 切片 A）。
//
// 背景：编译侧（tsc/swc，`include: apps/** + libs/**`、不设 rootDir）产物保留 `apps/api/src`
// 前缀，落 `dist/apps/api/src/i18n/*.js`；资产侧（nest-cli `assets`）剥 `sourceRoot` 前缀落
// `dist/i18n/{zh,en}`。两套语义自目录搬迁起分叉——旧代码用 `dirname(import.meta.url)` 直当
// 资产根，在生产产物下指向「只有 .js、没有 json/mjml」的目录，导致译文静默回退 key、发信 ENOENT。
//
// 本 helper 是**唯一**解析机制：从本模块所在目录向上逐级探测「真正的资产根」（判据 = 其下有 `zh/`），
// 覆盖源码布局（`.../i18n` 自身）与产物布局（上溯至 `dist` 再取其 `i18n/`）。全部落空则**启动即抛**
// （fail-closed），把「资产没拷对」从静默功能失效转为显式启动失败——与数据驻留守卫同一精神。

/** 语言子目录探测集：任一存在即视为合法资产根（zh 为 fallback 语言，必存）。 */
const PROBE_LANGS = ['zh', 'en'] as const;

function isAssetsRoot(dir: string): boolean {
  return PROBE_LANGS.some((lang) => fs.existsSync(path.join(dir, lang)));
}

/**
 * 解析 i18n 资产根（含 `<lang>/` 与 `emails/`）。
 * @param fromDir 起算目录，默认本模块所在目录（源码/产物皆随之定位，无需调用方传入）。
 * @throws 无任何候选根命中时抛错并列出已试路径（fail-closed）。
 */
export function resolveI18nAssetsRoot(
  fromDir: string = path.dirname(fileURLToPath(import.meta.url)),
): string {
  const tried: string[] = [];
  let dir = fromDir;
  // 逐词向上：每级先试 dir 自身（源码布局），再试 dir/i18n（产物布局：上溯到 dist 取其 i18n）。
  for (;;) {
    tried.push(dir);
    if (isAssetsRoot(dir)) return dir;
    const sibling = path.join(dir, 'i18n');
    tried.push(sibling);
    if (isAssetsRoot(sibling)) return sibling;
    const parent = path.dirname(dir);
    if (parent === dir) break; // 到达文件系统根
    dir = parent;
  }
  throw new Error(
    `i18n 资产根解析失败：自 ${fromDir} 向上未找到含 <lang>/ 的目录。` +
      `已试路径：\n  - ${tried.join('\n  - ')}\n` +
      `请确认 nest-cli assets 已把 i18n 数据（zh/en + emails）拷入产物。`,
  );
}

/** 邮件 MJML 模板目录（= 资产根下 `emails/`）。 */
export function resolveEmailsDir(fromDir?: string): string {
  return path.join(resolveI18nAssetsRoot(fromDir), 'emails');
}

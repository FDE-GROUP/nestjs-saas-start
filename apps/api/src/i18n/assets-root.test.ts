import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveEmailsDir, resolveI18nAssetsRoot } from './assets-root';

/**
 * i18n 资产根解析回归测（module-i18n-assets-resolution·切片 A·DB-free）：
 * 锁三件契约——①源码布局下解析到本目录（含 zh/en）；②邮件模板目录与资产根同源
 * （emails/ 随根走，产物布局 dist/i18n 由同一机制命中）；③**fail-closed**：无资产的
 * 起算目录必须抛错并列出已试路径——静默回退 key 曾让「测试绿但产物空」潜伏至今。
 */
describe('resolveI18nAssetsRoot（产物资产根单点解析）', () => {
  it('源码布局：解析到含 <lang>/ 的 i18n 目录（非仅 .js 的编译侧目录）', () => {
    const root = resolveI18nAssetsRoot();
    expect(path.basename(root)).toBe('i18n');
    // 真值断言：两语言目录与邮件模板均须就在解析出的根下（否则 loader 取不到译文）
    for (const lang of ['zh', 'en']) {
      expect(existsSync(path.join(root, lang))).toBe(true);
    }
    expect(existsSync(path.join(root, 'emails', 'welcome.mjml'))).toBe(true);
  });

  it('邮件模板目录与资产根同源（emails/ 挂在解析出的根下）', () => {
    const emailsDir = resolveEmailsDir();
    expect(emailsDir).toBe(path.join(resolveI18nAssetsRoot(), 'emails'));
  });

  it('fail-closed：起算目录下无任何资产时抛错并列出已试路径', async () => {
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'i18n-assets-missing-'));
    expect(() => resolveI18nAssetsRoot(emptyDir)).toThrow(/资产根解析失败/);
    expect(() => resolveI18nAssetsRoot(emptyDir)).toThrow(/请确认 nest-cli assets/);
  });
});

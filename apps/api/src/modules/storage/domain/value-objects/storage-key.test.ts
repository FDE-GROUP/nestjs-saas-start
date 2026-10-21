import { describe, expect, it } from 'vitest';
import { buildStorageKey } from './storage-key';

/**
 * 对象键命名规则纯单测（domain 零框架依赖·确定性）。
 * 锁 `YYYY/MM/DD/<id><ext>` 与 `path.extname` 语义对齐（多点取最后、dotfile 无扩展、无扩展）。
 */
describe('buildStorageKey（domain 值对象）', () => {
  const jan5 = new Date(2026, 0, 5);

  it('标准命名：年/月/日/<id><ext>，月/日补零', () => {
    expect(buildStorageKey('photo.png', jan5, 'abc')).toBe('2026/01/05/abc.png');
  });

  it('无扩展名', () => {
    expect(buildStorageKey('README', jan5, 'abc')).toBe('2026/01/05/abc');
  });

  it('多点取最后一段扩展', () => {
    expect(buildStorageKey('archive.tar.gz', jan5, 'x')).toBe('2026/01/05/x.gz');
  });

  it('dotfile（首位点）视为无扩展（对齐 path.extname）', () => {
    expect(buildStorageKey('.env', jan5, 'x')).toBe('2026/01/05/x');
  });

  it('双位月/日不额外补零', () => {
    expect(buildStorageKey('a.png', new Date(2026, 10, 11), 'x')).toBe('2026/11/11/x.png');
  });
});

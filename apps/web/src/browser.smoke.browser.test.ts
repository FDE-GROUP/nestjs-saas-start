import { describe, expect, it } from 'vitest';

// 浏览器模式设施冒烟（global-playwright-browser-e2e · 切片 A）：仅验证 chromium 真启动 +
// Vitest Browser Mode 接线通（跑在真浏览器 DOM 里），不依赖后端/DB。真栈黄金流见切片 B。
describe('browser mode smoke', () => {
  it('在真浏览器里能操作 DOM 且环境为浏览器', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'pw-smoke');
    el.textContent = 'hello';
    document.body.appendChild(el);
    expect(document.querySelector('[data-testid="pw-smoke"]')?.textContent).toBe('hello');
    el.remove();
  });

  it('UA 属 chromium（证真浏览器而非 jsdom 伪装）', () => {
    expect(navigator.userAgent.toLowerCase()).toContain('chrom');
  });
});

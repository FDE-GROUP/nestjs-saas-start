// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';
import {
  applyTheme,
  prefersDark,
  readStoredMode,
  resolveEffective,
  STORAGE_KEY,
  writeStoredMode,
} from './theme';

// 主题运行时 SSOT 纯逻辑测：锁三态解析、存储回落、系统偏好探测降级、.dark 落文档、持久化，
// 以及 `index.html` 内联防 FOUC 脚本与本模块的映射一致（同一 (stored, system) → effective 表）。

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  document.documentElement.classList.remove('dark');
  vi.unstubAllGlobals();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** 安装 matchMedia 桩：偏好暗色与否由 sysDark 决定（模拟 mql.addEventListener 存在）。 */
function stubMatchMedia(sysDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: sysDark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('resolveEffective（显式模式解析为生效主题）', () => {
  it('dark/light 强制覆盖系统偏好', () => {
    stubMatchMedia(true);
    expect(resolveEffective('dark')).toBe('dark');
    expect(resolveEffective('light')).toBe('light');
    stubMatchMedia(false);
    expect(resolveEffective('dark')).toBe('dark');
    expect(resolveEffective('light')).toBe('light');
  });

  it('system 跟随系统偏好（暗→dark、亮→light）', () => {
    stubMatchMedia(true);
    expect(resolveEffective('system')).toBe('dark');
    stubMatchMedia(false);
    expect(resolveEffective('system')).toBe('light');
  });
});

describe('prefersDark（系统偏好探测·降级保守）', () => {
  it('无 matchMedia 环境返 false', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    expect(prefersDark()).toBe(false);
  });

  it('matchMedia 命中暗色返 true、未命中返 false', () => {
    stubMatchMedia(true);
    expect(prefersDark()).toBe(true);
    stubMatchMedia(false);
    expect(prefersDark()).toBe(false);
  });
});

describe('readStoredMode（缺/非法回落 system）', () => {
  it('合法值原样返回', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(readStoredMode()).toBe('dark');
    localStorage.setItem(STORAGE_KEY, 'light');
    expect(readStoredMode()).toBe('light');
  });

  it('非法值/缺键回落 system', () => {
    localStorage.setItem(STORAGE_KEY, 'blue');
    expect(readStoredMode()).toBe('system');
    localStorage.removeItem(STORAGE_KEY);
    expect(readStoredMode()).toBe('system');
  });
});

describe('applyTheme（切 .dark 于 documentElement）', () => {
  it('生效 dark 落 .dark、light 移除', () => {
    stubMatchMedia(false);
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('system 随系统偏好落类', () => {
    stubMatchMedia(true);
    expect(applyTheme('system')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('writeStoredMode（持久化到 STORAGE_KEY）', () => {
  it('落 key', () => {
    writeStoredMode('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    writeStoredMode('system');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
  });
});

describe('index.html 内联防 FOUC 脚本 ↔ theme.ts 映射一致（真读产物·锁漂移）', () => {
  // 真实读取并执行 index.html 里的内联脚本（经 Vite `?raw` 取产物文本），逐格比对与 theme.ts 的
  // (stored, system)→dark 表。锁住 key 改名 / 判定逻辑被改 / 脚本被删（手抄副本锁不住这些·故必须读产物）。
  const html = indexHtml;
  // 取无属性的内联 <script> 体（带 src 的 module 脚本不匹配），再按 saas-theme 锁定防 FOUC 那段。
  const inlineFound = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes('saas-theme'));
  if (!inlineFound) {
    throw new Error(
      '未在 index.html 找到含 saas-theme 的内联防 FOUC 脚本——脚本被删或 key 改名？需与 theme.ts 同步。',
    );
  }
  const inline: string = inlineFound;

  /** 在受控 shim 下执行真实内联脚本，返回其是否给 <html> 加了 .dark。 */
  function runInlineScript(stored: string | null, sysDark: boolean): boolean {
    let added = false;
    const sandboxLocalStorage = { getItem: (k: string) => (k === STORAGE_KEY ? stored : null) };
    const sandboxWindow = { matchMedia: () => ({ matches: sysDark }) };
    const sandboxDocument = {
      documentElement: {
        classList: {
          add: (c: string) => {
            if (c === 'dark') added = true;
          },
        },
      },
    };
    // 在受控 shim 下执行仓库自身 index.html 的产物脚本（非动态外部输入），验证与 theme.ts 逐格一致
    new Function('localStorage', 'window', 'document', inline)(
      sandboxLocalStorage,
      sandboxWindow,
      sandboxDocument,
    );
    return added;
  }

  const STORED: (string | null)[] = ['light', 'dark', 'system', 'bogus', null];
  const SYS: boolean[] = [true, false];

  it('真实内联脚本的生效暗判定与 theme.ts 逐格一致', () => {
    for (const stored of STORED) {
      for (const sysDark of SYS) {
        if (stored === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, stored);
        stubMatchMedia(sysDark);
        const viaTheme = resolveEffective(readStoredMode()) === 'dark';
        expect(runInlineScript(stored, sysDark)).toBe(viaTheme);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  });

  it('内联脚本与 theme.ts 共用同一 STORAGE_KEY（防 key 漂移）', () => {
    expect(inline).toContain(`'${STORAGE_KEY}'`);
  });
});
